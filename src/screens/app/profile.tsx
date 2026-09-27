import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Card, Eyebrow, GhostButton, Screen, StatTile } from '@/components/app/ui';
import { formatMinutes } from '@/data/mock';
import { colors, font, space } from '@/theme/tokens';
import { useScreenTimeStore } from '@/state/useScreenTimeStore';
import { useBlockedAppsStore } from '@/state/useBlockedAppsStore';
import { supabase } from '@/lib/supabase';
import { scheduleDailyRoast, scheduleInactivityRoasts } from '@/lib/notifications';

const APP_DISPLAY: Record<string, string> = {
  instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok',
  reddit: 'Reddit', x: 'X', facebook: 'Facebook',
};

export function ProfileScreen() {
  const router = useRouter();
  const { todayStats, weeklyFocus, loadState } = useScreenTimeStore();
  const { blockedApps } = useBlockedAppsStore();
  const [email, setEmail] = useState('');
  const [strictMode, setStrictMode] = useState(true);
  const [dailyRoast, setDailyRoast] = useState(true);

  useEffect(() => {
    useScreenTimeStore.getState().load();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setEmail(data.user.email);
    });
    useBlockedAppsStore.getState().loadBlockedApps();
    
    // Load preferences
    AsyncStorage.getItem('prefs_daily_roast').then(val => {
      if (val !== null) setDailyRoast(val === 'true');
    });
  }, []);

  const isLoading = loadState === 'loading' || loadState === 'idle';

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  async function toggleDailyRoast(value: boolean) {
    setDailyRoast(value);
    await AsyncStorage.setItem('prefs_daily_roast', String(value));
    if (todayStats) {
      await scheduleDailyRoast(todayStats, weeklyFocus, value);
    }
    await scheduleInactivityRoasts(value);
  }

  const blockedDisplay = blockedApps
    .map((key) => APP_DISPLAY[key] ?? key)
    .join(' · ');

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Eyebrow>Profile</Eyebrow>
        <Text style={styles.handle}>{email || '—'}</Text>

        <View style={styles.tiles}>
          <StatTile
            value={isLoading ? '—' : `${todayStats?.streakDays ?? 0}d`}
            label="Streak"
            accent
          />
          <StatTile
            value={isLoading ? '—' : formatMinutes(todayStats?.focusMinutes ?? 0)}
            label="Focused"
          />
          <StatTile
            value={isLoading ? '—' : `${todayStats?.cookedScore ?? 0}%`}
            label="Cooked"
          />
        </View>

        <Card>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Strict mode</Text>
              <Text style={styles.rowMeta}>Blocked apps cannot be unblocked mid-session.</Text>
            </View>
            <Switch
              value={strictMode}
              onValueChange={setStrictMode}
              thumbColor={colors.text}
              trackColor={{ true: colors.spring, false: colors.line }}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Daily roast</Text>
              <Text style={styles.rowMeta}>One summary at 9pm. No push spam.</Text>
            </View>
            <Switch
              value={dailyRoast}
              onValueChange={toggleDailyRoast}
              thumbColor={colors.text}
              trackColor={{ true: colors.spring, false: colors.line }}
            />
          </View>
        </Card>

        <Card>
          <Pressable
            onPress={() => router.push('/circles')}
            style={styles.row}
            hitSlop={8}
          >
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Focus circle</Text>
              <Text style={styles.rowMeta}>See who&apos;s focusing right now.</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </Card>

        <Card>
          <Pressable
            onPress={() => router.push({ pathname: '/onboarding/apps', params: { edit: '1' } })}
            hitSlop={8}
          >
            <Text style={styles.rowTitle}>Blocked apps</Text>
            <Text style={styles.rowMeta}>
              {blockedDisplay || 'None selected — tap to pick apps.'}
            </Text>
          </Pressable>
        </Card>

        <GhostButton label="Log out" onPress={handleLogout} danger />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll:    { gap: space.md, paddingBottom: space.xl },
  handle:    { color: colors.text, fontFamily: font.display, fontSize: 24, letterSpacing: -0.4 },
  tiles:     { flexDirection: 'row', gap: space.sm },
  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  rowCopy:   { flex: 1, gap: 3 },
  rowTitle:  { color: colors.text, fontFamily: font.bodySemi, fontSize: 15 },
  rowMeta:   { color: colors.muted, fontFamily: font.body, fontSize: 12.5, lineHeight: 18 },
  divider:   { height: 1, backgroundColor: colors.line, marginVertical: space.md },
  chevron:   { color: colors.muted, fontSize: 22, fontFamily: font.body },
});
