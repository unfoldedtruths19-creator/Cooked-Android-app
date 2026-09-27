import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import CookedScreenTime from '../../modules/cooked-screen-time/src';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionSummary {
  attemptCount: number;
  sessionDurationMs: number;
  lastAttemptApp: string;
  lastWasBrowser: boolean;
}

export type FocusSessionState = 'idle' | 'active' | 'ended';

// ─── Roast generator — fits shape of existing roasts[] in mock.ts ─────────────

export function getRoastFromSummary(summary: SessionSummary): {
  hook: string;
  body: string;
  kicker: string;
} {
  const mins = Math.round(summary.sessionDurationMs / 60_000);
  const { attemptCount, lastWasBrowser } = summary;

  if (lastWasBrowser && attemptCount > 0) {
    return {
      hook: 'BROWSER DETECTED.',
      body: `Tried the browser trick ${attemptCount}x. We clocked every single one.`,
      kicker: "Incognito mode can't hide from COOKED.",
    };
  }
  if (attemptCount === 0) {
    const appName = summary.lastAttemptApp || 'those apps';
    return {
      hook: 'CLEAN SESSION.',
      body: `${mins} minutes. Zero slip-ups. Your future self is actually impressed.`,
      kicker: `Don’t celebrate on ${appName === '' ? 'those apps' : appName}.`,
    };
  }
  if (attemptCount <= 2) {
    return {
      hook: 'ALMOST.',
      body: `${attemptCount} attempt${attemptCount > 1 ? 's' : ''}. Almost had you — almost.`,
      kicker: 'Next session: zero.',
    };
  }
  if (attemptCount <= 5) {
    return {
      hook: 'BRO.',
      body: `${attemptCount} blocked attempts in ${mins} minutes. You were cooked the whole time.`,
      kicker: "The algorithm is winning on volume. Don't let it.",
    };
  }
  return {
    hook: 'BE HONEST.',
    body: `${attemptCount} attempts. That's not a focus session — that's a battle you lost repeatedly.`,
    kicker: 'Tomorrow: pick fewer apps. Start smaller.',
  };
}

export function getRandomAbandonmentRoast(plannedMins: number, actualMins: number) {
  const roasts = [
    "Bro is running on NPC mode. Zero productivity detected 💀",
    "Are you a human or a bot? Even bots finish their tasks 🤖",
    "Bro opened his phone for one thing and forgot his entire mission 😂",
    "Your focus needs a software update 💀",
    "Another distraction? Bro's attention span is on vacation.",
    "Bro's goals are in 4K, but his effort is running at 144p 🤡",
    `${plannedMins} minutes? Bro couldn't even survive the intro 💀`,
  ];
  const body = roasts[Math.floor(Math.random() * roasts.length)];
  return {
    hook: 'WEAK.',
    body,
    kicker: 'Lock in or log out.',
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFocusSession() {
  const [state, setState]         = useState<FocusSessionState>('idle');
  const [attemptCount, setCount]  = useState(0);
  const [summary, setSummary]     = useState<SessionSummary | null>(null);
  const [permError, setPermError] = useState<'usage' | 'overlay' | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Permission check ────────────────────────────────────────────────────────
  const checkAndRequestPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      const [usage, overlay] = await Promise.all([
        CookedScreenTime.hasUsagePermission(),
        CookedScreenTime.hasOverlayPermission(),
      ]);
      if (!usage) {
        await CookedScreenTime.requestPermission();
        setPermError('usage');
        return false;
      }
      if (!overlay) {
        await CookedScreenTime.requestOverlayPermission();
        setPermError('overlay');
        return false;
      }
      setPermError(null);
      return true;
    } catch {
      return false;
    }
  }, []);

  // ── Start ───────────────────────────────────────────────────────────────────
  // Returns whether the session actually started — callers must not start
  // the on-screen timer when this is false, or the countdown runs with
  // nothing actually being blocked.
  const start = useCallback(async (blockedApps: string[], task = '', allowBrowser = false): Promise<boolean> => {
    const ok = await checkAndRequestPermissions();
    if (!ok) return false;

    if (Platform.OS === 'android') {
      try {
        await CookedScreenTime.startFocusSession(blockedApps, task, allowBrowser);
      } catch {
        return false;
      }
    }

    setCount(0);
    setSummary(null);
    setState('active');

    // Poll attempt count every 3s to keep focus screen live
    pollRef.current = setInterval(async () => {
      if (Platform.OS !== 'android') return;
      try {
        const c = await CookedScreenTime.getAttemptCount();
        setCount(c as number);
      } catch {}
    }, 3_000);
    return true;
  }, [checkAndRequestPermissions]);

  // ── Stop ────────────────────────────────────────────────────────────────────
  const stop = useCallback(async (): Promise<SessionSummary> => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }

    let result: SessionSummary = {
      attemptCount: 0,
      sessionDurationMs: 0,
      lastAttemptApp: '',
      lastWasBrowser: false,
    };

    if (Platform.OS === 'android') {
      try {
        result = (await CookedScreenTime.stopFocusSession()) as SessionSummary;
      } catch {}
    }

    setSummary(result);
    setState('ended');
    return result;
  }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  return { state, attemptCount, summary, permError, start, stop, getRoastFromSummary };
}
