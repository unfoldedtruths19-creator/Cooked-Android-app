package com.cooked.screentime

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.*

/**
 * Full-screen overlay shown when a blocked app comes to foreground.
 * Shows the user's own task, a roast, and a motivational line.
 * Colors: ink #04100F | text #EAF4F1 | mint #8FE375 | muted #6F8A8C | ember #F0B36C
 */
class BlockingOverlayActivity : Activity() {

    companion object {
        // Paired: [roast, motivation]
        private val ROAST_PAIRS = listOf(
            Pair("really? right now? 💀",          "you were literally making progress."),
            Pair("bro what are you doing",           "the work won't do itself."),
            Pair("your future self is cringing.",    "close it and go back."),
            Pair("this is why you're cooked.",       "you're better than this."),
            Pair("nah bro nah",                      "you're so close — keep going."),
            Pair("the session isn't even over 😭",   "lock in."),
            Pair("skill issue fr",                   "proving yourself wrong is the move."),
            Pair("you chose this session.",           "finish what you started."),
        )

        private val BROWSER_PAIRS = listOf(
            Pair("nice try with the browser 💀",     "it won't load differently. go back."),
            Pair("bro really thought we'd miss that","browser != loophole. focus."),
            Pair("browser speedrun any%",             "speedrun your actual work instead."),
            Pair("incognito mode won't save you.",   "we see everything. get back."),
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lockScreen()
        val isBrowser   = intent.getBooleanExtra("is_browser", false)
        val currentTask = intent.getStringExtra("current_task") ?: ""
        setContentView(buildUI(isBrowser, currentTask))
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { /* intentionally blocked */ }

    // ─── Window flags ──────────────────────────────────────────────────────────

    private fun lockScreen() {
        window.apply {
            addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
            @Suppress("DEPRECATION")
            decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            )
        }
    }

    // ─── UI ────────────────────────────────────────────────────────────────────

    private fun buildUI(isBrowser: Boolean, currentTask: String): View {
        val pairs = if (isBrowser) BROWSER_PAIRS else ROAST_PAIRS
        val (roastText, motivationText) = pairs.random()

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#04100F"))
        }

        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity     = Gravity.CENTER
            setPadding(80, 0, 80, 0)
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        // 🔥 emoji
        val emoji = tv("🔥", 64f, Color.WHITE, Gravity.CENTER)

        // Roast line
        val roast = tv(roastText, 22f, Color.parseColor("#EAF4F1"), Gravity.CENTER).also {
            it.setPadding(0, 32, 0, 0)
        }

        // Task reminder — show what they're supposed to be doing
        if (currentTask.isNotBlank()) {
            val taskLabel = tv("you were working on:", 12f, Color.parseColor("#6F8A8C"), Gravity.CENTER)
                .also { it.setPadding(0, 28, 0, 0) }
            val taskValue = tv("\u201c$currentTask\u201d", 18f, Color.parseColor("#8FE375"), Gravity.CENTER)
                .also {
                    it.setPadding(0, 6, 0, 0)
                    it.setTypeface(null, Typeface.BOLD)
                }
            col.addView(emoji)
            col.addView(roast)
            col.addView(taskLabel)
            col.addView(taskValue)
        } else {
            col.addView(emoji)
            col.addView(roast)
        }

        // Motivational line
        val motivation = tv(motivationText, 15f, Color.parseColor("#A9BEBD"), Gravity.CENTER)
            .also { it.setPadding(0, 20, 0, 64) }
        col.addView(motivation)

        // CTA button
        val btn = Button(this).apply {
            text      = "back to work →"
            textSize  = 16f
            setTextColor(Color.parseColor("#04100F"))
            setBackgroundColor(Color.parseColor("#8FE375"))
            setPadding(72, 36, 72, 36)
            setOnClickListener { sendToHome() }
        }
        col.addView(btn)

        root.addView(col)
        root.post { animateIn(*col.run {
            (0 until childCount).map { getChildAt(it) }.toTypedArray()
        }) }
        return root
    }

    private fun tv(text: String, size: Float, color: Int, gravity: Int) =
        TextView(this).apply {
            this.text      = text
            this.textSize  = size
            this.gravity   = gravity
            setTextColor(color)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

    private fun animateIn(vararg views: View) =
        views.forEachIndexed { i, v ->
            v.alpha = 0f; v.translationY = 40f
            v.animate().alpha(1f).translationY(0f)
                .setStartDelay(i * 60L).setDuration(260).start()
        }

    private fun sendToHome() {
        startActivity(Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        })
        finish()
    }
}
