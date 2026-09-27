package com.cooked.screentime

import android.app.AppOpsManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.app.usage.UsageStatsManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import java.util.concurrent.atomic.AtomicBoolean
import java.text.SimpleDateFormat
import java.util.Date
import java.util.TimeZone

// ─── App key → package name ────────────────────────────────────────────────────
private val APP_PACKAGE_MAP = mapOf(
    "instagram" to "com.instagram.android",
    "youtube"   to "com.google.android.youtube",
    "tiktok"    to "com.zhiliaoapp.musically",
    "reddit"    to "com.reddit.frontpage",
    "x"         to "com.twitter.android",
    "facebook"  to "com.facebook.katana",
)

private val BROWSER_PACKAGES = setOf(
    "com.android.chrome",
    "org.mozilla.firefox",
    "com.brave.browser",
    "com.opera.browser",
    "com.microsoft.emmx",
    "com.sec.android.app.sbrowser",
)

private const val CHANNEL_ID     = "cooked_focus_channel"
private const val NOTIF_FOCUS_ID = 1001
private const val PREFS_NAME     = "cooked_blocking_prefs"
private const val POLL_MS        = 500L

class CookedScreenTimeModule : Module() {

    private val isBlocking     = AtomicBoolean(false)
    private val handler        = Handler(Looper.getMainLooper())
    private var wakeLock: PowerManager.WakeLock? = null
    private var lastForeground = ""

    private val ctx get() = appContext.reactContext
        ?: throw IllegalStateException("React context unavailable")

    private val prefs: SharedPreferences
        get() = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    override fun definition() = ModuleDefinition {
        Name("CookedScreenTime")

        // ── Legacy stubs — keep existing callers happy ────────────────────────
        Function("isAvailable") { true }

        AsyncFunction("requestPermission") {
            ctx.startActivity(
                Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
                    .apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            )
        }

        AsyncFunction("getUsageStats") { emptyMap<String, Any>() }

        // ── Permission checks ─────────────────────────────────────────────────
        AsyncFunction("hasUsagePermission") { hasUsagePermission() }

        AsyncFunction("hasOverlayPermission") { Settings.canDrawOverlays(ctx) }

        AsyncFunction("requestOverlayPermission") {
            ctx.startActivity(
                Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${ctx.packageName}")
                ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            )
        }

        // ── Focus session ─────────────────────────────────────────────────────

        AsyncFunction("startFocusSession") { appKeys: List<String>, currentTask: String, allowBrowser: Boolean ->
            if (!hasUsagePermission())      throw Exception("USAGE_PERMISSION_MISSING")
            if (!Settings.canDrawOverlays(ctx)) throw Exception("OVERLAY_PERMISSION_MISSING")

            val packages = appKeys.mapNotNull { APP_PACKAGE_MAP[it] }
            val arr = JSONArray().also { a -> packages.forEach(a::put) }

            prefs.edit()
                .putString("blocked_packages", arr.toString())
                .putString("current_task", currentTask)
                .putBoolean("session_active", true)
                .putBoolean("allow_browser", allowBrowser)
                .putInt("attempt_count", 0)
                .putLong("session_start_ms", System.currentTimeMillis())
                .apply()

            createNotificationChannel()
            acquireWakeLock()
            isBlocking.set(true)
            lastForeground = ""
            scheduleNextPoll()
            "ok"
        }

        AsyncFunction("stopFocusSession") {
            isBlocking.set(false)
            stopPolling()
            wakeLock?.release()
            wakeLock = null

            (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .cancel(NOTIF_FOCUS_ID)

            prefs.edit().putBoolean("session_active", false).apply()

            mapOf(
                "attemptCount"      to prefs.getInt("attempt_count", 0),
                "sessionDurationMs" to (System.currentTimeMillis() - prefs.getLong("session_start_ms", 0)),
                "lastAttemptApp"    to (prefs.getString("last_attempt_app", "") ?: ""),
                "lastWasBrowser"    to prefs.getBoolean("last_was_browser", false),
            )
        }

        // Pause/resume keep the session (task, blocked apps, attempt count) intact
        // but stop/start the polling loop that detects + blocks foreground apps.
        // Previously "Pause" only stopped the JS countdown — blocking (and the
        // ongoing notification) kept running underneath regardless.
        AsyncFunction("pauseFocusSession") {
            isBlocking.set(false)
            stopPolling()
            (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .cancel(NOTIF_FOCUS_ID)
            "ok"
        }

        AsyncFunction("resumeFocusSession") {
            if (prefs.getBoolean("session_active", false)) {
                createNotificationChannel()
                isBlocking.set(true)
                lastForeground = ""
                scheduleNextPoll()
            }
            "ok"
        }

        AsyncFunction("getAttemptCount") { prefs.getInt("attempt_count", 0) }

        AsyncFunction("isSessionActive") { prefs.getBoolean("session_active", false) }

        /**
         * Returns raw usage sessions since sinceEpochMs, built from real
         * foreground/background transitions (UsageEvents) rather than
         * UsageStatsManager's per-package totals.
         *
         * The old implementation queried queryUsageStats() and turned each
         * app's *entire* total-time-in-foreground for the whole lookback
         * window into a single synthetic "session" (then capped it at 4h) —
         * so a week of scattered Instagram opens became one fake multi-hour
         * blob. This version pairs real MOVE_TO_FOREGROUND/MOVE_TO_BACKGROUND
         * events into actual per-open sessions, each with its own accurate
         * start/end time and duration.
         *
         * Known trade-off: an app whose MOVE_TO_FOREGROUND happened before
         * `since` (i.e. in a previous sync's window) but backgrounds inside
         * this window has no matching start here, so that one session is
         * dropped rather than mis-attributed — undercounts slightly by at
         * most one open per app per sync, instead of ever double-counting.
         * We also deliberately do NOT emit a provisional session for an app
         * still in the foreground at query time: doing so would produce a
         * row that's later re-emitted with a longer duration but the SAME
         * start time once the app actually backgrounds, and the dedup
         * upsert (unique on user+package+start) would then discard the
         * corrected, complete row.
         *
         * Returns a list of maps: { package_name, app_name, platform,
         * session_start, session_end, duration_ms, device_id, local_date }
         * local_date is computed in the device's own timezone so the
         * server can group by the day the user actually experienced,
         * instead of the UTC calendar date (which shifts the "day" for
         * anyone west/east of UTC near midnight).
         */
        AsyncFunction("getUsageSince") { sinceEpochMs: Double ->
            val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val now   = System.currentTimeMillis()
            val since = sinceEpochMs.toLong()

            val pm  = ctx.packageManager
            val deviceId = android.provider.Settings.Secure.getString(
                ctx.contentResolver, android.provider.Settings.Secure.ANDROID_ID
            )

            val sdfUtc = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
            sdfUtc.timeZone = TimeZone.getTimeZone("UTC")
            // Deliberately NOT set to UTC — uses the device's own default
            // timezone, which is exactly what we want for "local day".
            val sdfLocal = SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)

            fun appNameFor(pkg: String): String = try {
                @Suppress("DEPRECATION")
                pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
            } catch (e: Exception) {
                pkg.split(".").filter { it.isNotEmpty() }.lastOrNull()
                    ?.replaceFirstChar { c -> c.uppercase() } ?: pkg
            }

            val events = usm.queryEvents(since, now)
            val openSince = mutableMapOf<String, Long>()
            val sessions = mutableListOf<Map<String, Any>>()
            val MIN_SESSION_MS = 1_000L // drop sub-second flicker between apps

            val event = android.app.usage.UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(event)
                val pkg = event.packageName ?: continue
                when (event.eventType) {
                    android.app.usage.UsageEvents.Event.MOVE_TO_FOREGROUND -> {
                        openSince[pkg] = event.timeStamp
                    }
                    android.app.usage.UsageEvents.Event.MOVE_TO_BACKGROUND -> {
                        val start = openSince.remove(pkg) ?: continue
                        val end = event.timeStamp
                        val duration = end - start
                        if (duration >= MIN_SESSION_MS) {
                            sessions.add(
                                mapOf(
                                    "package_name"  to pkg,
                                    "app_name"      to appNameFor(pkg),
                                    "platform"      to "android",
                                    "session_start" to sdfUtc.format(Date(start)),
                                    "session_end"   to sdfUtc.format(Date(end)),
                                    "duration_ms"   to duration,
                                    "device_id"     to deviceId,
                                    "local_date"    to sdfLocal.format(Date(start)),
                                )
                            )
                        }
                    }
                }
            }

            sessions
        }
    }

    // ─── Polling ──────────────────────────────────────────────────────────────

    private val pollRunnable: Runnable = object : Runnable {
        override fun run() {
            if (!isBlocking.get()) return
            checkForeground()
            scheduleNextPoll()
        }
    }

    private fun scheduleNextPoll(): Boolean {
        return handler.postDelayed(pollRunnable, POLL_MS)
    }

    private fun stopPolling(): Unit {
        handler.removeCallbacks(pollRunnable)
    }

    private fun checkForeground() {
        val pkg = getForegroundPackage() ?: return
        if (pkg == lastForeground) return
        lastForeground = pkg

        val blocked  = getBlockedPackages()
        val isBlock  = pkg in blocked
        val allowBrowser = prefs.getBoolean("allow_browser", false)
        val isBrowse = pkg in BROWSER_PACKAGES && blocked.isNotEmpty() && !allowBrowser

        if (isBlock || isBrowse) {
            logAttempt(pkg, isBrowse)
            showOverlay(pkg, isBrowse)
            fireRoastNotification(isBrowse)
        }
    }

    private fun getForegroundPackage(): String? {
        val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        // queryEvents is much more accurate for real-time foreground detection
        // than queryUsageStats, which can be delayed or bucketed.
        val events = usm.queryEvents(now - 10_000, now)
        var foregroundPkg: String? = null
        var hasEvent = false
        val event = android.app.usage.UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == android.app.usage.UsageEvents.Event.MOVE_TO_FOREGROUND) {
                foregroundPkg = event.packageName
                hasEvent = true
            } else if (event.eventType == android.app.usage.UsageEvents.Event.MOVE_TO_BACKGROUND) {
                // If the app backgrounding is what we currently think is foreground, clear it.
                if (foregroundPkg == event.packageName || foregroundPkg == null) {
                    foregroundPkg = null
                    hasEvent = true
                }
            }
        }
        return if (hasEvent) foregroundPkg else lastForeground
    }

    private fun getBlockedPackages(): Set<String> {
        val json = prefs.getString("blocked_packages", "[]") ?: "[]"
        val arr  = JSONArray(json)
        return (0 until arr.length()).map { arr.getString(it) }.toSet()
    }

    // ─── Overlay ──────────────────────────────────────────────────────────────

    private fun showOverlay(pkg: String, isBrowser: Boolean) {
        val task = prefs.getString("current_task", "") ?: ""
        ctx.startActivity(
            Intent(ctx, BlockingOverlayActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("package_name", pkg)
                putExtra("is_browser", isBrowser)
                putExtra("current_task", task)
            }
        )
    }

    // ─── Attempt logger ───────────────────────────────────────────────────────

    private fun logAttempt(pkg: String, isBrowser: Boolean) {
        val appName = APP_PACKAGE_MAP.entries.firstOrNull { it.value == pkg }?.key ?: pkg
        prefs.edit()
            .putInt("attempt_count", prefs.getInt("attempt_count", 0) + 1)
            .putString("last_attempt_app", appName)
            .putBoolean("last_was_browser", isBrowser)
            .putLong("last_attempt_ms", System.currentTimeMillis())
            .apply()
    }

    // ─── Notifications ────────────────────────────────────────────────────────

    private var lastRoastTime: Long = 0
    private var roastCount: Int = 0

    private fun fireRoastNotification(isBrowser: Boolean) {
        val now = System.currentTimeMillis()
        if (now - lastRoastTime < 30_000) return // 30s cooldown
        if (roastCount >= 5) return // max 5 roasts per session
        lastRoastTime = now
        roastCount++

        val task = prefs.getString("current_task", "") ?: ""

        val title = "BRO 💀"
        val bodyLines = if (isBrowser) listOf(
            "Tried the browser trick? NPC behavior 🤖",
            "Incognito mode won't save your attention span 😂",
            "Browser speedrun any%? Do your work noob."
        ) else listOf(
            "Another distraction? Your focus just rage-quit.",
            "Are you a human or a bot? Even bots finish their tasks 🤖",
            "Bro opened his phone for one thing and forgot his entire mission 😂",
            "Your focus needs a software update 💀",
            "Bro's attention span is on vacation.",
            "Bro's goals are in 4K, but his effort is running at 144p 🤡"
        )

        val body = if (task.isNotBlank()) {
            "${bodyLines.random()} You were working on: $task"
        } else {
            bodyLines.random()
        }

        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        // Use incrementing counter — toInt() on currentTimeMillis wraps and causes collisions
        val notifId = (prefs.getInt("notif_counter", 2000) + 1).coerceIn(2001, Int.MAX_VALUE)
        prefs.edit().putInt("notif_counter", notifId).apply()

        val notif = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()
        nm.notify(notifId, notif)
    }

    private fun createNotificationChannel() {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "COOKED Focus", NotificationManager.IMPORTANCE_HIGH)
                .apply { description = "Blocking + roast notifications" }
        )
        nm.notify(
            NOTIF_FOCUS_ID,
            NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("Focus session active 🔒")
                .setContentText("COOKED is watching. Don't even try it.")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build()
        )
    }

    // ─── Wake lock ────────────────────────────────────────────────────────────

    private fun acquireWakeLock() {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock?.release()
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "COOKED:FocusWakeLock")
            .apply { acquire(10 * 60 * 60 * 1000L) }
    }

    private fun hasUsagePermission(): Boolean = try {
        val appOps = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            android.os.Process.myUid(),
            ctx.packageName
        ) == AppOpsManager.MODE_ALLOWED
    } catch (e: Exception) { false }
}
