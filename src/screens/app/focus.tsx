import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
  Alert,
  BackHandler,
} from 'react-native';

import { GhostButton, PrimaryButton, Screen } from '@/components/app/ui';
import { colors, font, radius, space } from '@/theme/tokens';
import { getActiveFocusSession, abandonFocusSession, completeFocusSession, pauseFocusSession, resumeFocusSession, syncFocusAttempts, type FocusSession } from '@/lib/focus';
import { useFocusSession } from '@/state/useFocusSession';
import { useBlockedAppsStore } from '@/state/useBlockedAppsStore';
import { useFocusTaskStore } from '@/state/useFocusTaskStore';
import { useAllowBrowserStore } from '@/state/useAllowBrowserStore';
import CookedScreenTime from '../../../modules/cooked-screen-time/src';

const APP_DISPLAY: Record<string, string> = {
  instagram: 'Instagram',
  youtube:   'YouTube',
  tiktok:    'TikTok',
  reddit:    'Reddit',
  x:         'X',
  facebook:  'Facebook',
};

function clock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function Ambient({ running }: { running: boolean }) {
  const [pulse]       = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (!running || reduceMotion) { pulse.stopAnimation(); return; }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1, duration: 4200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion, running]);

  const scale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.25] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.35, 0.12, 0] });

  return (
    <View style={styles.ambient} pointerEvents="none">
      <Animated.View style={[styles.ring, { opacity, transform: [{ scale }] }]} />
      <View style={styles.ringStatic} />
    </View>
  );
}

export function FocusScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ready?: string; sessionId?: string }>();
  const { blockedApps, setBlockedApps } = useBlockedAppsStore();
  const { task, clearTask, setTask }    = useFocusTaskStore();
  const { allowBrowser, setAllowBrowser } = useAllowBrowserStore();

  // The DB row is the ONLY source of truth for whether a session exists and
  // what its numbers are. This screen never invents a session id or a
  // started_at — it always fetches the real row first. `null` = "checked,
  // and there is no open session" (not the same as still-loading).
  const [session, setSession]     = useState<FocusSession | null | 'loading' | 'error'>('loading');
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning]     = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const remainingRef = useRef(remaining);
  const isEnding       = useRef(false);
  const endAtRef        = useRef<number | null>(null); // wall-clock end timestamp, from the server
  const attemptCountRef = useRef(0);

  const { start, stop, attemptCount, permError } = useFocusSession();
  useEffect(() => { attemptCountRef.current = attemptCount; }, [attemptCount]);
  useEffect(() => { remainingRef.current = remaining; }, [remaining]);

  // Mirror the native attempt counter into the DB so a kill/reopen mid-session
  // can recover it (best-effort — failures here must never interrupt the
  // session itself, so errors are swallowed).
  useEffect(() => {
    if (!session || session === 'loading' || session === 'error') return;
    syncFocusAttempts(session.id, attemptCount).catch(() => {});
  }, [session, attemptCount]);

  // Note: params.ready is no longer trusted as a gate — whether this tab was
  // opened via setup, tapped directly, or recovered on app startup, we
  // always ask the DB what's actually open (see the fetch effect below).

  // ── Fetch the real session — never create one here ──────────────────────────
  const loadSession = useCallback(async () => {
    setSession('loading');
    const { session: s, error } = await getActiveFocusSession();
    if (error) {
      setSession('error');
      return;
    }
    if (!s) {
      setSession(null);
      return;
    }
    setSession(s);
    setTask(s.task ?? '');
    setBlockedApps(s.blocked_apps ?? []);
    setAllowBrowser(!!s.allow_browser);
    setRemaining(s.remaining_seconds);
    if (s.is_paused) {
      // Recovered into an already-paused session (e.g. app was killed
      // while paused): don't anchor a ticking end time or the countdown
      // would resume on its own. `running` starts false; the "start
      // native blocking" effect below still re-issues the native start
      // call (blocking itself isn't paused, only the timer/reward is),
      // but leaves the JS timer stopped until the user taps Resume.
      endAtRef.current = null;
      setRunning(false);
    } else {
      endAtRef.current = Date.now() + s.remaining_seconds * 1000;
    }
  }, [setTask, setBlockedApps, setAllowBrowser]);

  useEffect(() => {
    loadSession();
  }, [params.sessionId, loadSession]);

  // ── End session (abandon = user quit early; natural = duration reached) ─────
  const handleEnd = useCallback(async (naturally: boolean) => {
    if (isEnding.current || !session || session === 'loading' || session === 'error') return;
    isEnding.current = true;
    setRunning(false);

    const nativeSummary = await stop();
    const finalAttempts = Math.max(attemptCountRef.current, nativeSummary.attemptCount);
    clearTask();

    // The server, not this client, decides whether "naturally" holds up:
    // complete_focus_session rejects it if the planned duration hasn't
    // actually elapsed yet (e.g. a stale timer firing a hair early).
    const { session: closed, error } = naturally
      ? await completeFocusSession(session.id, finalAttempts)
      : await abandonFocusSession(session.id, finalAttempts);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }

    const result = closed ?? session; // last-known state if the RPC itself failed offline
    if (error) console.warn('focus session close RPC failed, using last-known state:', error);

    router.replace({
      pathname: '/roast',
      params: {
        attemptCount:      String(finalAttempts),
        sessionDurationMs: String(result.duration_seconds * 1000),
        plannedDurationMs: String(result.planned_duration_seconds * 1000),
        abandoned:         naturally ? '0' : '1',
        lastAttemptApp:    nativeSummary.lastAttemptApp,
        lastWasBrowser:    nativeSummary.lastWasBrowser ? '1' : '0',
        task:              result.task ?? '',
      },
    });
  }, [stop, router, session, clearTask]);

  // ── Start native blocking once we know the real session ─────────────────────
  useEffect(() => {
    if (session == null || session === 'loading' || session === 'error') return;
    (async () => {
      // Re-issued on every mount, including a recovery mount after the app
      // (and native process) was killed — CookedScreenTime.startFocusSession
      // must be safe to call again for an already-active session. This is
      // NOT verified on-device; flagged for native-side testing.
      const ok = await start(session.blocked_apps, session.task ?? '', session.allow_browser);
      if (ok) {
        // Don't force the timer to run if we recovered into a paused
        // session — the fetch effect above already set running=false and
        // left endAtRef null for that case.
        if (!session.is_paused) setRunning(true);
      } else {
        setStartFailed(true);
        Alert.alert(
          'Permission needed',
          'Please grant Usage Access and Draw Over Other Apps permissions to enable blocking.',
        );
      }
    })();
    return () => { stop().catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session === 'loading' ? 'loading' : (session as FocusSession | null)?.id]);

  // ── Timer — wall-clock based ─────────────────────────────────────────────────
  // Ticks every second for a smooth-looking clock, but the *source of truth*
  // is endAtRef (a real timestamp), so backgrounding the app (which throttles
  // or pauses JS timers) can't make the countdown drift or freeze. Recomputed
  // immediately whenever the app returns to the foreground too.
  const recomputeRemaining = useCallback(() => {
    if (endAtRef.current == null) return;
    const secondsLeft = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
    setRemaining(secondsLeft);
    if (secondsLeft <= 0) {
      handleEnd(true);
    }
  }, [handleEnd]);

  useEffect(() => {
    if (!running) return;
    recomputeRemaining();
    const id = setInterval(recomputeRemaining, 1_000);
    return () => clearInterval(id);
  }, [running, recomputeRemaining]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') recomputeRemaining();
    });
    return () => sub.remove();
  }, [recomputeRemaining]);

  const confirmEnd = useCallback(() => {
    Alert.alert(
      'End focus session?',
      'Your progress will be saved.',
      [
        { text: 'Keep Going', style: 'cancel' },
        { text: 'End Session', style: 'destructive',
          onPress: () => handleEnd(false) },
      ],
      { cancelable: true },
    );
  }, [handleEnd]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmEnd(); return true;
    });
    return () => sub.remove();
  }, [confirmEnd]);

  // Pause/resume is now DB-tracked (paused_at/paused_seconds on the row —
  // see supabase/migrations/20260924130000_focus_session_pause_resume.sql),
  // so a kill while paused recovers correctly: remaining_seconds stays
  // frozen at whatever it was when paused, instead of counting the paused
  // interval as elapsed. The RPC's returned remaining_seconds/ends_at are
  // authoritative — the local endAtRef is just re-anchored to match them.
  const isTogglingRef = useRef(false);
  async function toggle() {
    if (isTogglingRef.current || !session || session === 'loading' || session === 'error') return;
    isTogglingRef.current = true;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const wasRunning = running;
    setRunning(!wasRunning); // optimistic; corrected below if the RPC disagrees

    try {
      if (wasRunning) {
        // Pausing: clear the wall-clock anchor immediately so the AppState
        // listener can't recompute against a stale pre-pause end time while
        // the RPC is in flight.
        endAtRef.current = null;
        if (Platform.OS === 'android') CookedScreenTime.pauseFocusSession?.().catch(() => {});
        const { session: s } = await pauseFocusSession(session.id);
        if (s) setRemaining(s.remaining_seconds);
      } else {
        if (Platform.OS === 'android') CookedScreenTime.resumeFocusSession?.().catch(() => {});
        const { session: s } = await resumeFocusSession(session.id);
        const remainingNow = s?.remaining_seconds ?? remainingRef.current;
        endAtRef.current = Date.now() + remainingNow * 1000;
        setRemaining(remainingNow);
      }
    } finally {
      isTogglingRef.current = false;
    }
  }

  if (session === 'loading') {
    return (
      <Screen style={{ flex: 1, paddingBottom: space.xl, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.mint} />
      </Screen>
    );
  }

  if (session === 'error') {
    return (
      <Screen style={{ flex: 1, paddingBottom: space.xl, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={[styles.taskText, { textAlign: 'center', marginBottom: space.md, color: colors.ember }]}>
          Couldn't load your session.
        </Text>
        <PrimaryButton
          label="Retry"
          onPress={loadSession}
        />
      </Screen>
    );
  }

  if (session === null) {
    return (
      <Screen style={{ flex: 1, paddingBottom: space.xl, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={[styles.taskText, { textAlign: 'center', marginBottom: space.lg, color: colors.textDim }]}>
          No active session.
        </Text>
        <PrimaryButton
          label="START FOCUS"
          icon={{ ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }}
          onPress={() => router.replace('/focus-setup')}
        />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <Ambient running={running} />

      <View style={styles.center}>
        {/* What you're working on */}
        {task.length > 0 && (
          <View style={styles.taskBadge}>
            <Text style={styles.taskLabel}>WORKING ON</Text>
            <Text style={styles.taskText} numberOfLines={1}>{task}</Text>
          </View>
        )}

        <Text style={styles.stateLabel}>{running ? 'FOCUS SESSION' : 'PAUSED'}</Text>
        <Text style={styles.clock}>{clock(remaining)}</Text>

        {/* Blocked apps */}
        {blockedApps.length > 0 && (
          <View style={styles.blockedRow}>
            {blockedApps.map((key) => (
              <View key={key} style={styles.blockedChip}>
                <Text style={styles.blockedChipText}>
                  {APP_DISPLAY[key] ?? key}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Live distraction counter */}
        <Text style={styles.resisted}>
          {attemptCount === 0
            ? '0 distractions so far 👀'
            : `${attemptCount} distraction${attemptCount > 1 ? 's' : ''} blocked 🔥`}
        </Text>

        {permError != null && (
          <Text style={styles.permWarn}>
            {permError === 'usage'
              ? '⚠ Grant Usage Access to enable blocking'
              : '⚠ Grant Draw Over Other Apps to enable blocking'}
          </Text>
        )}

        {startFailed && permError == null && (
          <Text style={styles.permWarn}>
            ⚠ Blocking couldn&apos;t start — nothing is being blocked this session.
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        <GhostButton
          label={running ? 'Pause' : 'Resume'}
          onPress={toggle}
          style={styles.actionBtn}
        />
        <GhostButton
          label="End session"
          onPress={confirmEnd}
          danger
          style={styles.actionBtn}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen:           { justifyContent: 'space-between', paddingBottom: space.xl },
  ambient:          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      alignItems: 'center', justifyContent: 'center' },
  ring:             { width: 320, height: 320, borderRadius: 160,
                      borderWidth: 1, borderColor: colors.mint },
  ringStatic:       { position: 'absolute', width: 320, height: 320, borderRadius: 160,
                      borderWidth: 1, borderColor: 'rgba(173, 226, 210, 0.08)' },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
  taskBadge:        { alignItems: 'center', gap: 4, paddingHorizontal: space.lg,
                      paddingVertical: space.sm, borderRadius: radius.pill,
                      borderWidth: 1, borderColor: 'rgba(143,227,117,0.25)',
                      backgroundColor: 'rgba(143,227,117,0.06)', maxWidth: '80%' },
  taskLabel:        { color: colors.mint, fontFamily: font.bodyMedium,
                      fontSize: 9, letterSpacing: 2.4 },
  taskText:         { color: colors.text, fontFamily: font.display,
                      fontSize: 15, letterSpacing: -0.2 },
  stateLabel:       { color: colors.muted, fontFamily: font.bodyMedium,
                      fontSize: 11, letterSpacing: 3.4 },
  clock:            { color: colors.text, fontFamily: font.displayHeavy,
                      fontSize: 76, lineHeight: 84, letterSpacing: -2,
                      fontVariant: ['tabular-nums'] },
  blockedRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6,
                      justifyContent: 'center', paddingHorizontal: space.lg },
  blockedChip:      { borderRadius: radius.pill, borderWidth: 1,
                      borderColor: colors.glassLine,
                      paddingHorizontal: 10, paddingVertical: 4 },
  blockedChipText:  { color: colors.muted, fontFamily: font.bodyMedium, fontSize: 12 },
  resisted:         { color: colors.mint, fontFamily: font.bodySemi, fontSize: 13,
                      letterSpacing: 0.4, borderWidth: 1,
                      borderColor: 'rgba(143, 227, 117, 0.3)',
                      borderRadius: radius.pill,
                      paddingHorizontal: 14, paddingVertical: 7 },
  permWarn:         { color: colors.ember, fontFamily: font.body, fontSize: 12,
                      textAlign: 'center', paddingHorizontal: space.lg },
  actions:          { flexDirection: 'row', gap: space.sm },
  actionBtn:        { flex: 1 },
});
