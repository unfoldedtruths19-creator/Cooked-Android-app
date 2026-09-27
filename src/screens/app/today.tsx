import { BlurView } from 'expo-blur';
import { useNavigation, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Card, Eyebrow, PrimaryButton, Screen, StatTile } from '@/components/app/ui';
import { formatMinutes } from '@/data/mock';
import { blur, colors, font, radius, space } from '@/theme/tokens';
import { useScreenTimeStore } from '@/state/useScreenTimeStore';
import { type WeeklyFocusDay } from '@/lib/screenTimeData';
import { runIncrementalSync } from '@/lib/sync';
import { supabase } from '@/lib/supabase';
import { useState } from 'react';
import { scheduleDailyRoast } from '@/lib/notifications';

export function TodayScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { loadState, todayStats, weeklyFocus, previousWeeklyFocus, refresh } = useScreenTimeStore();
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    useScreenTimeStore.getState().load();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.user_metadata?.full_name || data?.user?.user_metadata?.name) {
        setUserName(data.user.user_metadata.name || data.user.user_metadata.full_name);
      }
    });
  }, []);

  useEffect(() => {
    if (todayStats && weeklyFocus) {
      AsyncStorage.getItem('prefs_daily_roast').then(val => {
        const enabled = val !== 'false'; // Default true
        scheduleDailyRoast(todayStats, weeklyFocus, enabled).catch(console.error);
      });
    }
  }, [todayStats, weeklyFocus]);

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

  // Daily focus goal logic
  const dailyGoalMinutes = 60;
  const focusMinutes = stats?.focusMinutes ?? 0;
  const progressPercent = Math.min(100, Math.round((focusMinutes / dailyGoalMinutes) * 100));

  const weeklyGoal = dailyGoalMinutes * 7;

  const [roastSeed, setRoastSeed] = useState(0);

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

  const isNewUser = stats?.journeyDay === 1 && focusMinutes === 0 && (stats?.streakDays ?? 0) === 0;
  const welcomeMessage = isNewUser
    ? `Welcome to Day 1!`
    : userName 
      ? `Welcome back, ${userName}!` 
      : `Welcome back!`;

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
          <Eyebrow>{welcomeMessage}</Eyebrow>
          <View style={styles.headerRight}>
            <View style={styles.streak}>
              <SymbolView
                name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }}
                tintColor={colors.text}
                size={14}
              />
              <Text style={[styles.streakText, { color: colors.text }]}>
                {isLoading ? '—' : `Day ${stats?.journeyDay ?? 1}`}
              </Text>
            </View>
            <View style={styles.streak}>
              <SymbolView
                name={{ ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' }}
                tintColor={colors.mint}
                size={14}
              />
              <Text style={styles.streakText}>
                {isLoading ? '—' : `${stats?.streakDays ?? 0} streak`}
              </Text>
            </View>
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

        {/* Focus Progress Section */}
        {!isLoading && (
          <Card>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Daily Focus Goal</Text>
              <Text style={styles.progressValues}>
                {formatMinutes(focusMinutes)} / {formatMinutes(dailyGoalMinutes)}
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
          </Card>
        )}

        {/* Weekly Dashboard Section */}
        {!isLoading && weeklyFocus && weeklyFocus.length > 0 && (
          <Card style={styles.weeklySection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>This Week's Plan</Text>
              <Text style={styles.progressValues}>
                {formatMinutes(weeklyFocus.reduce((sum, day) => sum + (day.focusMinutes || 0), 0))} / {formatMinutes(weeklyGoal)}
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.round((weeklyFocus.reduce((sum, day) => sum + (day.focusMinutes || 0), 0) / weeklyGoal) * 100))}%`, backgroundColor: colors.mint }]} />
            </View>

            <View style={styles.weeklySummaryTextContainer}>
              <Text style={styles.weeklySummaryText}>
                {weeklyFocus.reduce((sum, day) => sum + (day.sessionCount || 0), 0)} sessions completed this week
              </Text>
            </View>

            <View style={styles.weeklyChart}>
              {weeklyFocus.map(day => {
                const percent = Math.max(0, Math.min(100, Math.round((day.focusMinutes / dailyGoalMinutes) * 100)));
                let barColor = 'rgba(255,255,255,0.1)';
                if (day.status === 'completed') barColor = colors.mint;
                else if (day.status === 'in_progress') barColor = '#F2C94C';
                else if (day.status === 'missed') barColor = colors.danger;
                
                return (
                  <Pressable 
                    key={day.date} 
                    style={({ pressed }) => [styles.weeklyDay, pressed && styles.pressed]}
                    onPress={() => router.push('/(tabs)/insights')}
                  >
                    <View style={styles.weeklyBarBg}>
                      <View style={[styles.weeklyBarFill, { height: `${percent}%`, backgroundColor: barColor }]} />
                    </View>
                    <Text style={styles.weeklyDayLabel}>{day.dayName}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        )}

        {/* Previous Week Dashboard Section */}
        {!isLoading && stats && (
          stats.journeyDay >= 14 ? (
            previousWeeklyFocus && previousWeeklyFocus.length > 0 && (
              <Card style={styles.weeklySection}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressLabel}>Last Week's Plan</Text>
                  <Text style={styles.progressValues}>
                    {formatMinutes(previousWeeklyFocus.reduce((sum, day) => sum + (day.focusMinutes || 0), 0))} / {formatMinutes(weeklyGoal)}
                  </Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.round((previousWeeklyFocus.reduce((sum, day) => sum + (day.focusMinutes || 0), 0) / weeklyGoal) * 100))}%`, backgroundColor: colors.mint }]} />
                </View>

                <View style={styles.weeklySummaryTextContainer}>
                  <Text style={styles.weeklySummaryText}>
                    {previousWeeklyFocus.reduce((sum, day) => sum + (day.sessionCount || 0), 0)} sessions completed last week
                  </Text>
                </View>

                <View style={styles.weeklyChart}>
                  {previousWeeklyFocus.map(day => {
                    const percent = Math.max(0, Math.min(100, Math.round((day.focusMinutes / dailyGoalMinutes) * 100)));
                    let barColor = 'rgba(255,255,255,0.1)';
                    if (day.status === 'completed') barColor = colors.mint;
                    else if (day.status === 'in_progress') barColor = '#F2C94C';
                    else if (day.status === 'missed') barColor = colors.danger;
                    
                    return (
                      <Pressable 
                        key={day.date} 
                        style={({ pressed }) => [styles.weeklyDay, pressed && styles.pressed]}
                        onPress={() => router.push('/(tabs)/insights')}
                      >
                        <View style={styles.weeklyBarBg}>
                          <View style={[styles.weeklyBarFill, { height: `${percent}%`, backgroundColor: barColor }]} />
                        </View>
                        <Text style={styles.weeklyDayLabel}>{day.dayName}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            )
          ) : (
            <Card style={[styles.weeklySection, { opacity: 0.5 }]}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Last Week's Plan</Text>
                <SymbolView name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }} tintColor={colors.muted} size={16} />
              </View>
              <View style={styles.weeklySummaryTextContainer}>
                <Text style={styles.weeklySummaryText}>
                  Unlock previous week insights after 14 days of focus. Keep going!
                </Text>
              </View>
            </Card>
          )
        )}

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

        {/* Removed Roast Card to Notifications */}

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
  headerRight:      { flexDirection: 'row', alignItems: 'center', gap: space.sm },
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
  progressSection: {
    padding: space.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  progressLabel: {
    fontFamily: font.bodySemi,
    fontSize: 14,
    color: colors.text,
  },
  progressValues: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.textDim,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.mint,
    borderRadius: radius.pill,
  },
  weeklySection: {
    marginTop: space.sm,
    padding: space.sm,
  },
  weeklyChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: space.md,
    height: 100,
  },
  weeklyDay: {
    alignItems: 'center',
    gap: 8,
  },
  weeklyBarBg: {
    width: 24,
    height: 70,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.pill,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  weeklyBarFill: {
    width: '100%',
    borderRadius: radius.pill,
  },
  weeklyDayLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 12,
    color: colors.textDim,
  },
  weeklySummaryTextContainer: {
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  weeklySummaryText: {
    fontFamily: font.bodyMedium,
    fontSize: 13,
    color: colors.muted,
  },
  tiles:            { flexDirection: 'row', gap: space.sm },
  roast:            { flexDirection: 'row', alignItems: 'center', gap: space.md,
                      backgroundColor: colors.glass, borderRadius: radius.card - 6,
                      borderCurve: 'continuous', borderWidth: 1, borderColor: colors.glassLine,
                      overflow: 'hidden', padding: space.md },
  roastCopy:        { flex: 1, gap: 6 },
  roastHeaderRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roastLabel:       { color: colors.muted, fontFamily: font.bodySemi, fontSize: 11, letterSpacing: 1 },
  roastLine:        { color: colors.text, fontFamily: font.display, fontSize: 15, lineHeight: 21 },
  pressed:          { opacity: 0.85 },
});
