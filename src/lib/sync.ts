import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUsageSessions } from '@/services/screenTimeNative';
import { ingestScreenTime } from '@/services/ingestApi';

const LAST_SYNC_KEY = 'cooked_last_sync_epoch_ms';

// 30-day lookback the very first time we've never synced before.
const INITIAL_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Pulls usage sessions since the last successful sync (or the last 30 days
 * on a first-ever sync), uploads them, and advances the sync watermark.
 *
 * This is what makes screen-time numbers keep updating for returning users —
 * previously only sync-loading (reached once, on first permission grant)
 * ever called into the native module, so every session after the first
 * looked frozen in time.
 */
export async function runIncrementalSync(): Promise<{ inserted: number } | null> {
  const storedSince = await AsyncStorage.getItem(LAST_SYNC_KEY);
  const since = storedSince ? Number(storedSince) : Date.now() - INITIAL_LOOKBACK_MS;
  const syncStartedAt = Date.now();

  const sessions = await getUsageSessions(since);

  if (sessions.length === 0) {
    // Nothing new (or native module unavailable).
    // Only advance the watermark on the initial 30-day lookback so we don't
    // keep re-querying a huge window on a fresh install with no data.
    // For all subsequent syncs, leave the watermark where it is — the next
    // sync will re-check from the same point, preventing data from being
    // silently skipped if the phone hasn't produced sessions yet.
    if (!storedSince) {
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(syncStartedAt));
    }
    return { inserted: 0 };
  }

  const result = await ingestScreenTime(sessions);
  await AsyncStorage.setItem(LAST_SYNC_KEY, String(syncStartedAt));
  return { inserted: result.inserted };
}
