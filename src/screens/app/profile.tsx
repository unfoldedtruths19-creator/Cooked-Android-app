import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Card, Eyebrow, GhostButton, Screen, StatTile } from '@/components/app/ui';
import { formatMinutes } from '@/data/mock';
import { colors, font, space } from '@/theme/tokens';
import { useScreenTimeStore } from '@/state/useScreenTimeStore';
import { useBlockedAppsStore } from '@/state/useBlockedAppsStore';
import { supabase } from '@/lib/supabase';
import { scheduleDailyRoast, scheduleInactivityRoasts } from '@/lib/notifications';
import { LEGAL_URLS, openLegalUrl } from '@/lib/legal';

const APP_DISPLAY: Record<string, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  reddit: 'Reddit',
  x: 'X',
  facebook: 'Facebook',
};

export function ProfileScreen() {
  const router = useRouter();
  const { todayStats, weeklyFocus, loadState } = useScreenTimeStore();
  const { blockedApps } = useBlockedAppsStore();
  const [email, setEmail] = useState('');
  const [strictMode, setStrictMode] = useState(true);
  const [dailyRoast, setDailyRoast] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    useScreenTimeStore.getState().load();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setEmail(data.user.email);
    });
    useBlockedAppsStore.getState().loadBlockedApps();

    // Load preferences
    AsyncStorage.getItem('prefs_daily_roast').then((val) => {
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

  function handleDeleteAccountPrompt() {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to permanently delete your COOKED account and associated personal data? This action cannot be undone.\n\nAll focus sessions, screen time history, and account records will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'View Policy',
          onPress: () => openLegalUrl(LEGAL_URLS.deleteAccount),
        },
        {
          text: 'Permanently Delete',
          style: 'destructive',
          onPress: confirmDeleteAccount,
        },
      ]
    );
  }

  async function confirmDeleteAccount() {
    try {
      setIsDeleting(true);
      const { error } = await supabase.rpc('delete_user');
      if (error) {
        Alert.alert(
          'Deletion Failed',
          error.message ||
            'Unable to complete account deletion automatically. Please contact cookedappoffical@gmail.com with your deletion request.'
        );
        setIsDeleting(false);
        return;
      }

      // Clean local storage and sessions
      await AsyncStorage.clear();
      await supabase.auth.signOut();
      Alert.alert(
        'Account Deleted',
        'Your account and associated personal information have been deleted.'
      );
      router.replace('/');
    } catch (err: any) {
      console.error('Account deletion error:', err);
      Alert.alert(
        'Deletion Error',
        err?.message ||
          'A technical error occurred. Please contact cookedappoffical@gmail.com for assistance.'
      );
    } finally {
      setIsDeleting(false);
    }
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
              <Text style={styles.rowMeta}>See who's focusing right now.</Text>
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

        {/* Legal & Support Section */}
        <Card>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Legal & Support</Text>
          </View>

          <Pressable
            onPress={() => openLegalUrl(LEGAL_URLS.terms)}
            style={styles.row}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Terms of Service"
          >
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Terms of Service</Text>
              <Text style={styles.rowMeta}>Terms, acceptable use, and service policies.</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={() => openLegalUrl(LEGAL_URLS.privacy)}
            style={styles.row}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
          >
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Privacy Policy</Text>
              <Text style={styles.rowMeta}>Data handling, permissions, and privacy rights.</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={() => openLegalUrl(LEGAL_URLS.contact)}
            style={styles.row}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Contact Support"
          >
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>Contact Support</Text>
              <Text style={styles.rowMeta}>cookedappoffical@gmail.com</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={handleDeleteAccountPrompt}
            style={styles.row}
            hitSlop={8}
            disabled={isDeleting}
            accessibilityRole="button"
            accessibilityLabel="Delete Account"
          >
            <View style={styles.rowCopy}>
              <Text style={[styles.rowTitle, { color: colors.danger }]}>
                {isDeleting ? 'Deleting account...' : 'Delete Account'}
              </Text>
              <Text style={styles.rowMeta}>
                Permanently delete account, sessions, and logs.
              </Text>
            </View>
            <Text style={[styles.chevron, { color: colors.danger }]}>›</Text>
          </Pressable>
        </Card>

        <GhostButton label="Log out" onPress={handleLogout} danger />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll:        { gap: space.md, paddingBottom: space.xl },
  handle:        { color: colors.text, fontFamily: font.display, fontSize: 24, letterSpacing: -0.4 },
  tiles:         { flexDirection: 'row', gap: space.sm },
  row:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  rowCopy:       { flex: 1, gap: 3 },
  rowTitle:      { color: colors.text, fontFamily: font.bodySemi, fontSize: 15 },
  rowMeta:       { color: colors.muted, fontFamily: font.body, fontSize: 12.5, lineHeight: 18 },
  divider:       { height: 1, backgroundColor: colors.line, marginVertical: space.md },
  chevron:       { color: colors.muted, fontSize: 22, fontFamily: font.body },
  sectionHeader: { marginBottom: space.sm },
  sectionTitle:  { color: colors.spring, fontFamily: font.displayBold, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase' },
});
