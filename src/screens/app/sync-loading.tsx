import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { AppBackground } from '@/components/app/app-background';
import { colors, font, space } from '@/theme/tokens';
import { useSyncStore } from '@/state/useSyncStore';
import { runIncrementalSync } from '@/lib/sync';
import { hasCompletedOnboarding } from '@/lib/onboarding';
import { track, AnalyticsEvents } from '@/lib/analytics';
import { AuthButton } from '@/screens/auth/auth-button';

const TROLL_COPY = [
  'pulling your receipts\u2026',
  'counting every scroll\u2026',
  'no judgment. okay, some judgment.',
];

export function SyncLoadingScreen() {
  const router = useRouter();
  const status       = useSyncStore((s) => s.status);
  const errorMessage = useSyncStore((s) => s.errorMessage);
  const setStatus    = useSyncStore((s) => s.setStatus);
  const [copyIndex, setCopyIndex] = useState(0);

  const runSync = useCallback(async () => {
    setStatus('syncing');
    try {
      // Native module unavailable (Expo Go) or no sessions in the lookback
      // window still resolves cleanly — dashboard shows an empty state and
      // the user can pull-to-refresh once real data is available.
      await runIncrementalSync();

      setStatus('success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // First-time users go through the severity/goals/apps questionnaire
      // once — it was previously built but never linked into any flow, so
      // it never ran for anyone.
      const onboarded = await hasCompletedOnboarding();
      router.replace(onboarded ? '/(tabs)/today' : '/onboarding');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong during sync.';
      setStatus('error', message);
    }
  }, [router, setStatus]);

  useEffect(() => { runSync(); }, [runSync]);

  // Cycle troll copy while syncing
  useEffect(() => {
    if (status !== 'syncing') return;
    const interval = setInterval(() => {
      setCopyIndex((i) => (i + 1) % TROLL_COPY.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [status]);

  const handleRetry = () => {
    track(AnalyticsEvents.SYNC_RETRY_TAPPED);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    runSync();
  };

  return (
    <View style={styles.screen}>
      <AppBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          {status === 'error' ? (
            <>
              <Text style={styles.eyebrow}>SYNC FAILED</Text>
              <Text style={styles.headline}>Couldn{'\u2019'}t pull your receipts.</Text>
              <Text style={styles.subhead}>{errorMessage ?? 'Something went wrong. Try again.'}</Text>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={colors.mint} style={{ marginBottom: space.lg }} />
              <Text style={styles.headline}>{TROLL_COPY[copyIndex]}</Text>
              <Text style={styles.subhead}>Give us a second {'\u2014'} we{'\u2019'}re tallying the damage.</Text>
            </>
          )}
        </View>

        {status === 'error' && (
          <View style={styles.footer}>
            <AuthButton label="Try again" onPress={handleRetry} />
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:   { flex: 1, backgroundColor: colors.ink },
  safe:     { flex: 1, justifyContent: 'space-between' },
  content:  { flex: 1, alignItems: 'center', justifyContent: 'center',
              paddingHorizontal: space.xl, gap: space.sm },
  eyebrow:  { color: colors.danger, fontFamily: font.bodySemi, fontSize: 13,
              letterSpacing: 3, textTransform: 'uppercase', marginBottom: space.xs },
  headline: { color: colors.text, fontFamily: font.displayHeavy, fontSize: 24,
              textAlign: 'center', letterSpacing: -0.5, lineHeight: 30 },
  subhead:  { color: colors.textDim, fontFamily: font.body, fontSize: 16,
              textAlign: 'center', lineHeight: 24 },
  footer:   { paddingHorizontal: space.lg, paddingBottom: space.xl },
});
