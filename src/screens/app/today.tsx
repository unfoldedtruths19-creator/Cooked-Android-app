import { BlurView } from 'expo-blur';
import { useNavigation, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Eyebrow, PrimaryButton, Screen, StatTile } from '@/components/app/ui';
import { formatMinutes } from '@/data/mock';
import { blur, colors, font, radius, space } from '@/theme/tokens';
import { useScreenTimeStore } from '@/state/useScreenTimeStore';
import { runIncrementalSync } from '@/lib/sync';

export function TodayScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { loadState, todayStats, refresh } = useScreenTimeStore();

  useEffect(() => {
    useScreenTimeStore.getState().load();
  }, []);

  // Refetch every time this tab regains focus — e.g. after finishing a
  // focus session and getting bounced back here from the roast screen.
  // load() alone won't do it: it's a no-op once the store is already
  // 'ready', which it always is after the first visit.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      runIncrementalSync().catch(() => {});
      useScreenTimeStore.getState().refresh();
    });
    return unsubscribe;
  }, [navigation]);

  const isLoading  = loadState === 'loading' || loadState === 'idle';
  const stats      = todayStats;
  const down       = (stats?.changeVsYesterday ?? 0) < 0;

  // ── Error state ─────────────────────────────────────────────────────────────
  if (loadState === 'error') {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.errorTitle}>Couldn’t load your stats.</Text>
        <Text style={styles.errorSub}>Check your connection and pull to refresh.</Text>
        <Pressable onPress={() => refresh()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={loadState === 'loading'}
            onRefresh={() => refresh()}
            tintColor={colors.mint}
          />
        }
      >
        <View style={styles.header}>
          <Eyebrow>Today</Eyebrow>
          <View style={styles.streak}>
            <SymbolView
              name={{ ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' }}
              tintColor={colors.mint}
              size={14}
            />
            <Text style={styles.streakText}>
              {isLoading ? '—' : `${stats?.streakDays ?? 0} day streak`}
            </Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroLead}>YOU&apos;RE</Text>

          {isLoading ? (
            <ActivityIndicator size="large" color={colors.mint} style={styles.loader} />
          ) : (
            <>
              <Text style={styles.heroScore}>{stats?.cookedScore ?? 0}%</Text>
              <Text style={styles.heroWord}>COOKED</Text>

              <View style={styles.heroMeta}>
                <Text style={styles.heroScreen}>
                  {formatMinutes(stats?.screenTimeMinutes ?? 0)} screen time
                </Text>
                {(stats?.screenTimeMinutes ?? 0) > 0 && (
                  <View style={[styles.delta, down ? styles.deltaGood : styles.deltaBad]}>
                    <Text style={[styles.deltaText, down ? styles.deltaTextGood : styles.deltaTextBad]}>
                      {down ? '↓' : '↑'} {Math.abs(stats?.changeVsYesterday ?? 0)}% vs yesterday
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>

        <View style={styles.tiles}>
          <StatTile
            value={isLoading ? '—' : formatMinutes(stats?.focusMinutes ?? 0)}
            label="Focused"
            accent
          />
          <StatTile
            value={isLoading ? '—' : String(stats?.distractions ?? 0)}
            label="Distractions"
          />
          <StatTile
            value={isLoading ? '—' : String(stats?.pickups ?? 0)}
            label="Pickups"
          />
        </View>

        <PrimaryButton
          label="START FOCUS"
          icon={{ ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }}
          onPress={() => router.push('/focus-setup')}
        />

        {/* Today roast — only render once real data has loaded, no mock fallback */}
        {!isLoading && stats != null && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Read today’s roast"
            onPress={() => router.push({
              pathname: '/roast',
              params: {
                todayScreenMinutes: String(stats.screenTimeMinutes),
                todayPickups:       String(stats.pickups),
                todayCookedScore:   String(stats.cookedScore),
                todayTopAppName:    stats.topApp?.name ?? '',
                todayTopAppOpens:   String(stats.topApp?.opens ?? 0),
              },
            })}
            style={({ pressed }) => [styles.roast, pressed && styles.pressed]}
          >
            <BlurView intensity={blur.tile} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.roastCopy}>
              <Eyebrow>Today&apos;s roast</Eyebrow>
              <Text style={styles.roastLine} numberOfLines={2}>
                {stats.topApp
                  ? `You opened ${stats.topApp.name} ${stats.topApp.opens}x today. That’s basically a part-time job.`
                  : stats.screenTimeMinutes > 0
                    ? `${Math.round(stats.screenTimeMinutes / 60)}h of screen time. Your thumb did more reps than you did.`
                    : 'No screen time logged yet today. Suspicious.'}
              </Text>
            </View>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              tintColor={colors.muted}
              size={18}
            />
          </Pressable>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll:           { gap: space.lg, paddingBottom: space.xl },
  centered:         { alignItems: 'center', justifyContent: 'center', flex: 1 },
  errorTitle:       { color: colors.text, fontFamily: font.displayHeavy, fontSize: 20, textAlign: 'center' },
  errorSub:         { color: colors.muted, fontFamily: font.body, fontSize: 14, textAlign: 'center', marginTop: 8 },
  retryBtn:         { marginTop: 24, borderWidth: 1, borderColor: colors.mint,
                      borderRadius: radius.pill, paddingHorizontal: 28, paddingVertical: 10 },
  retryText:        { color: colors.mint, fontFamily: font.bodySemi, fontSize: 14 },
  loader:           { marginVertical: 32 },
  header:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streak:           { flexDirection: 'row', alignItems: 'center', gap: 6,
                      borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill,
                      paddingHorizontal: 10, paddingVertical: 5 },
  streakText:       { color: colors.textDim, fontFamily: font.bodyMedium, fontSize: 12 },
  hero:             { alignItems: 'center', paddingTop: space.md },
  heroLead:         { color: colors.muted, fontFamily: font.bodyMedium, fontSize: 13, letterSpacing: 3 },
  heroScore:        { color: colors.mint, fontFamily: font.displayHeavy,
                      fontSize: 104, lineHeight: 112, letterSpacing: -4 },
  heroWord:         { color: colors.text, fontFamily: font.displayHeavy,
                      fontSize: 30, letterSpacing: 10, marginTop: -6, marginLeft: 10 },
  heroMeta:         { alignItems: 'center', gap: space.sm, marginTop: space.md },
  heroScreen:       { color: colors.textDim, fontFamily: font.body, fontSize: 15 },
  delta:            { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1 },
  deltaGood:        { borderColor: 'rgba(143, 227, 117, 0.35)', backgroundColor: 'rgba(143, 227, 117, 0.08)' },
  deltaBad:         { borderColor: 'rgba(240, 132, 108, 0.35)', backgroundColor: 'rgba(240, 132, 108, 0.08)' },
  deltaText:        { fontFamily: font.bodySemi, fontSize: 12 },
  deltaTextGood:    { color: colors.mint },
  deltaTextBad:     { color: colors.danger },
  tiles:            { flexDirection: 'row', gap: space.sm },
  roast:            { flexDirection: 'row', alignItems: 'center', gap: space.md,
                      backgroundColor: colors.glass, borderRadius: radius.card - 6,
                      borderCurve: 'continuous', borderWidth: 1, borderColor: colors.glassLine,
                      overflow: 'hidden', padding: space.md },
  roastCopy:        { flex: 1, gap: 6 },
  roastLine:        { color: colors.text, fontFamily: font.display, fontSize: 15, lineHeight: 21 },
  pressed:          { opacity: 0.85 },
});
