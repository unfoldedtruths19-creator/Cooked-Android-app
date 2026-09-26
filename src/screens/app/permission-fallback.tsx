import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppBackground } from '@/components/app/app-background';
import { colors, font, radius, space } from '@/theme/tokens';
import { usePermissionStore } from '@/state/usePermissionStore';
import { hasScreenTimePermission, openScreenTimeSettings } from '@/services/screenTimeNative';
import { track, AnalyticsEvents } from '@/lib/analytics';
import { AuthButton } from '@/screens/auth/auth-button';

const ANDROID_STEPS = [
  { title: 'Open Settings', body: "Yeah, the boring gray app. We\u2019ll make it quick." },
  { title: 'Find Usage Access', body: 'Search \u201cUsage access\u201d or dig through Apps \u2192 Special access.' },
  { title: 'Select COOKED', body: "It\u2019s the one you\u2019re avoiding right now." },
  { title: 'Flip the switch', body: 'Turn on \u201cPermit usage access.\u201d That\u2019s the whole job.' },
];

const IOS_STEPS = [
  { title: 'Open Settings', body: 'The default gray icon. Not COOKED. The other one.' },
  { title: 'Tap Screen Time', body: "It\u2019s near the top, under Privacy & Security-adjacent settings." },
  { title: 'Share Across Devices (if asked)', body: "Doesn\u2019t matter either way \u2014 keep going." },
  { title: 'Allow COOKED access', body: 'Find COOKED in the app list and flip it on.' },
];

export function PermissionFallbackScreen() {
  const router    = useRouter();
  const setStatus = usePermissionStore((s) => s.setStatus);
  const [checking, setChecking]   = useState(false);
  const [openedSettings, setOpenedSettings] = useState(false);
  const [stillDenied, setStillDenied]       = useState(false);

  const steps = Platform.OS === 'android' ? ANDROID_STEPS : IOS_STEPS;

  useEffect(() => { setStatus('fallback'); }, [setStatus]);

  // ── "Take me to settings" ─────────────────────────────────────────────────
  const handleOpenSettings = async () => {
    track(AnalyticsEvents.PERMISSION_FALLBACK_SETTINGS_OPENED);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStillDenied(false);
    try {
      await openScreenTimeSettings();
      setOpenedSettings(true); // show "check again" prompt more prominently
    } catch (err) {
      console.warn('[PermissionFallback] openScreenTimeSettings error:', err);
    }
  };

  // ── "I did it — check again" ──────────────────────────────────────────────
  const handleRecheck = async () => {
    track(AnalyticsEvents.PERMISSION_FALLBACK_RECHECK_TAPPED);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setChecking(true);
    setStillDenied(false);
    try {
      const granted = await hasScreenTimePermission();
      if (granted) {
        setStatus('granted');
        router.replace('/sync-loading');
      } else {
        setStatus('denied');
        setStillDenied(true); // show inline feedback instead of silent fail
      }
    } catch (err) {
      console.warn('[PermissionFallback] hasScreenTimePermission error:', err);
      setStillDenied(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={styles.screen}>
      <AppBackground />
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.eyebrow}>NOT SO FAST</Text>
          <Text style={styles.headline}>
            Denying access is a very {'\u201c'}cooked{'\u201d'} move.
          </Text>
          <Text style={styles.subhead}>
            No worries {'\u2014'} we{'\u2019'}ll walk you there manually.
            It{'\u2019'}s four taps, not a whole thing.
          </Text>

          <View style={styles.stepsWrap}>
            {steps.map((step, i) => (
              <View key={step.title} style={styles.stepCard}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>{i + 1}</Text>
                </View>
                <View style={styles.stepTextWrap}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepBody}>{step.body}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Inline feedback after "check again" while still denied */}
          {stillDenied && (
            <View style={styles.deniedBanner}>
              <Text style={styles.deniedText}>
                Still not seeing it. Make sure you tapped COOKED in the list and flipped the switch fully on, then check again.
              </Text>
            </View>
          )}

          {/* Prompt after settings opened */}
          {openedSettings && !stillDenied && (
            <Text style={styles.hint}>
              Done in settings? Tap {'\u201c'}I did it{'\u201d'} below.
            </Text>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <AuthButton label="Take me to settings" onPress={handleOpenSettings} />
          <View style={{ height: space.sm }} />
          <AuthButton
            label={checking ? 'Checking\u2026' : 'I did it \u2014 check again'}
            onPress={handleRecheck}
            isLoading={checking}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: colors.ink },
  safe:          { flex: 1 },
  scrollContent: { paddingHorizontal: space.lg, paddingTop: space.xl,
                   paddingBottom: space.lg, gap: space.md },
  eyebrow:       { color: colors.mint, fontFamily: font.bodySemi, fontSize: 13,
                   letterSpacing: 3, textTransform: 'uppercase' },
  headline:      { color: colors.text, fontFamily: font.displayHeavy, fontSize: 28,
                   letterSpacing: -0.5, lineHeight: 34 },
  subhead:       { color: colors.textDim, fontFamily: font.body, fontSize: 16, lineHeight: 24 },
  stepsWrap:     { marginTop: space.md, gap: space.sm },
  stepCard:      { flexDirection: 'row', backgroundColor: colors.glass,
                   borderRadius: radius.card - 6, padding: space.md,
                   borderWidth: 1, borderColor: colors.glassLine,
                   gap: space.md, alignItems: 'flex-start' },
  stepBadge:     { width: 28, height: 28, borderRadius: 999, backgroundColor: colors.mint,
                   alignItems: 'center', justifyContent: 'center' },
  stepBadgeText: { color: colors.ink, fontFamily: font.displayBold, fontSize: 13 },
  stepTextWrap:  { flex: 1, gap: 2 },
  stepTitle:     { color: colors.text, fontFamily: font.bodySemi, fontSize: 15 },
  stepBody:      { color: colors.textDim, fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  deniedBanner:  { backgroundColor: 'rgba(240,132,108,0.12)', borderRadius: radius.field,
                   borderWidth: 1, borderColor: 'rgba(240,132,108,0.35)',
                   padding: space.md },
  deniedText:    { color: colors.danger, fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  hint:          { color: colors.mint, fontFamily: font.bodySemi, fontSize: 14,
                   textAlign: 'center' },
  footer:        { paddingHorizontal: space.lg, paddingBottom: space.xl, paddingTop: space.sm },
});
