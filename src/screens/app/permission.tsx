import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { AppBackground } from '@/components/app/app-background';
import { colors, font, space } from '@/theme/tokens';
import { usePermissionStore } from '@/state/usePermissionStore';
import { hasScreenTimePermission, openScreenTimeSettings } from '@/services/screenTimeNative';
import { track, AnalyticsEvents } from '@/lib/analytics';
import { AuthButton } from '@/screens/auth/auth-button';

export function PermissionScreen() {
  const router = useRouter();
  const status = usePermissionStore((s) => s.status);
  const setStatus = usePermissionStore((s) => s.setStatus);

  // True once we've sent the user to Settings and are waiting for them to
  // come back — used to tell a genuine "still not granted" apart from the
  // moment right after the settings page opens (which used to be treated
  // as an instant denial before the user had a chance to flip the switch).
  const awaitingReturn = useRef(false);

  useEffect(() => {
    track(AnalyticsEvents.PERMISSION_SCREEN_VIEWED);
  }, []);

  // Android can't prompt for Usage Access directly — it opens the Settings
  // page and we have to notice when the user comes back to the app.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active' || !awaitingReturn.current) return;
      awaitingReturn.current = false;

      const granted = await hasScreenTimePermission().catch(() => false);
      if (granted) {
        setStatus('granted');
        router.replace('/sync-loading');
      } else {
        setStatus('denied');
        router.replace('/permission-fallback');
      }
    });
    return () => sub.remove();
  }, [router, setStatus]);

  const handleGrantAccess = async () => {
    track(AnalyticsEvents.PERMISSION_CTA_TAPPED);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStatus('requesting');

    if (Platform.OS === 'android') {
      // Just open Settings — do NOT re-check immediately after. The user
      // hasn't had a chance to flip the switch yet at this point, so an
      // immediate check always reads as denied. The AppState listener
      // above re-checks once they actually return to the app.
      awaitingReturn.current = true;
      try {
        await openScreenTimeSettings();
      } catch (err) {
        console.warn('[PermissionScreen] openScreenTimeSettings failed:', err);
        awaitingReturn.current = false;
        setStatus('denied');
        router.replace('/permission-fallback');
      }
      return;
    }

    // iOS / other platforms: no settings round-trip needed, check directly.
    try {
      const granted = await hasScreenTimePermission();
      if (granted) {
        setStatus('granted');
        router.replace('/sync-loading');
      } else {
        setStatus('denied');
        router.replace('/permission-fallback');
      }
    } catch (err) {
      console.warn('[PermissionScreen] hasScreenTimePermission failed:', err);
      setStatus('denied');
      router.replace('/permission-fallback');
    }
  };

  return (
    <View style={styles.screen}>
      <AppBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>COOKED</Text>
          <Text style={styles.headline}>Time to see how cooked you really are.</Text>
          <Text style={styles.subhead}>
            One tap gives COOKED access to your screen time — that’s it, that’s the whole setup.
          </Text>
        </View>

        <View style={styles.footer}>
          <AuthButton
            label={status === 'requesting' ? 'Checking…' : "Let's see the damage"}
            onPress={handleGrantAccess}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  safe: {
    flex: 1,
    justifyContent: 'space-between',
  },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.xl * 2,
    gap: space.md,
  },
  eyebrow: {
    color: colors.mint,
    fontFamily: font.bodySemi,
    fontSize: 13,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  headline: {
    color: colors.text,
    fontFamily: font.displayHeavy,
    fontSize: 34,
    letterSpacing: -0.5,
    lineHeight: 40,
  },
  subhead: {
    color: colors.textDim,
    fontFamily: font.body,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 320,
  },
  footer: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
  },
});
