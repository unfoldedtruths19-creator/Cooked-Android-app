import { Platform, Linking, PermissionsAndroid } from 'react-native';
import CookedScreenTime from '../../modules/cooked-screen-time/src';

/**
 * Single seam between JS and the native CookedScreenTime Expo module.
 *
 * The module is registered via expo-modules-core (requireNativeModule),
 * NOT via the legacy NativeModules bridge — so all calls go through the
 * default export from modules/cooked-screen-time/src/index.ts.
 *
 * When running in Expo Go (no native build), every call gracefully degrades:
 *   - hasScreenTimePermission  → returns false
 *   - requestScreenTimePermission → opens settings via Linking
 *   - openScreenTimeSettings   → opens settings via Linking
 *   - getUsageSessions         → returns []
 *
 * This means sync-loading gets an empty array → edge function returns
 * { inserted: 0, skipped: 0, capped: 0 } → user lands on dashboard.
 * Better than crashing.
 */

export interface RawUsageSession {
  package_name: string;
  platform: 'android' | 'ios';
  session_start: string; // ISO 8601
  session_end: string;   // ISO 8601
  duration_ms: number;
  device_id?: string;
  local_date?: string;   // 'YYYY-MM-DD' in the device's own timezone
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isModuleAvailable(): boolean {
  try {
    return typeof CookedScreenTime?.hasUsagePermission === 'function';
  } catch {
    return false;
  }
}

async function openSettingsFallback(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Linking.sendIntent('android.settings.USAGE_ACCESS_SETTINGS');
    } else {
      await Linking.openURL('app-settings:');
    }
  } catch {
    // Linking also unavailable — silently ignore
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns true if usage/screen-time permission is already granted. */
export async function hasScreenTimePermission(): Promise<boolean> {
  if (!isModuleAvailable()) return false;
  try {
    return (await CookedScreenTime.hasUsagePermission()) as boolean;
  } catch {
    return false;
  }
}

/**
 * Triggers the native permission request flow.
 * On Android this opens the Usage Access settings page (can't prompt directly).
 * Returns true if permission is now granted (Android: always false after opening
 * settings — caller should re-check with hasScreenTimePermission).
 */
export async function requestScreenTimePermission(): Promise<boolean> {
  if (!isModuleAvailable()) {
    await openSettingsFallback();
    return false;
  }
  try {
    await CookedScreenTime.requestPermission();
    // After opening settings, re-check actual state
    return (await CookedScreenTime.hasUsagePermission()) as boolean;
  } catch {
    await openSettingsFallback();
    return false;
  }
}

/** Deep-links into the OS usage-access settings page. */
export async function openScreenTimeSettings(): Promise<void> {
  if (!isModuleAvailable()) {
    await openSettingsFallback();
    return;
  }
  try {
    await CookedScreenTime.requestPermission(); // opens settings on Android
  } catch {
    await openSettingsFallback();
  }
}

/**
 * Pulls raw usage sessions since a given epoch timestamp.
 * Returns [] when the native module is unavailable (Expo Go / no build).
 */
export async function getUsageSessions(sinceEpochMs: number): Promise<RawUsageSession[]> {
  if (!isModuleAvailable()) return [];
  try {
    return (await CookedScreenTime.getUsageSince(sinceEpochMs)) as RawUsageSession[];
  } catch {
    return [];
  }
}

/** Returns true if SYSTEM_ALERT_WINDOW (draw over other apps) is granted. */
export async function hasOverlayPermission(): Promise<boolean> {
  if (!isModuleAvailable()) return false;
  try {
    return (await CookedScreenTime.hasOverlayPermission()) as boolean;
  } catch {
    return false;
  }
}

/** Opens the Draw Over Other Apps settings page for COOKED. */
export async function requestOverlayPermission(): Promise<void> {
  if (!isModuleAvailable()) {
    await openSettingsFallback();
    return;
  }
  try {
    await CookedScreenTime.requestOverlayPermission();
  } catch {
    await openSettingsFallback();
  }
}

/**
 * Android 13+ (API 33+) requires a runtime prompt for notifications —
 * declaring POST_NOTIFICATIONS in the manifest alone isn't enough, so roast
 * notifications silently never showed. No-op on iOS and older Android.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    // PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS is only defined on
    // RN versions that ship the API-33 permission constants; guard for older ones.
    const permission =
      (PermissionsAndroid.PERMISSIONS as Record<string, string>).POST_NOTIFICATIONS;
    if (!permission) return true; // running on an OS/RN build without the concept
    const result = await PermissionsAndroid.request(permission as any);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/** Check both permissions needed for app blocking. */
export async function checkBlockingPermissions(): Promise<{
  usage: boolean;
  overlay: boolean;
}> {
  const [usage, overlay] = await Promise.all([
    hasScreenTimePermission(),
    hasOverlayPermission(),
  ]);
  return { usage, overlay };
}
