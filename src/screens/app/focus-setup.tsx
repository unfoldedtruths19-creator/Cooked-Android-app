import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackground } from '@/components/app/app-background';
import { BrandIcon } from '@/components/app/brand-icon';
import { blur, colors, font, radius, space } from '@/theme/tokens';
import { useBlockedAppsStore } from '@/state/useBlockedAppsStore';
import { useFocusTaskStore } from '@/state/useFocusTaskStore';
import { useFocusDurationStore, SESSION_DURATION_OPTIONS } from '@/state/useFocusDurationStore';
import { useAllowBrowserStore } from '@/state/useAllowBrowserStore';
import { APPS } from '@/screens/onboarding/plan-data';
import {
  checkBlockingPermissions,
  openScreenTimeSettings,
  requestOverlayPermission,
  requestNotificationPermission,
} from '@/services/screenTimeNative';
import { generateUUID, startFocusSession } from '@/lib/focus';

// ─── Constants ────────────────────────────────────────────────────────────────

const TASK_SUGGESTIONS = [
  'Deep work 🧠',
  'Study session 📚',
  'Writing ✍️',
  'Project work 💻',
  'Reading 📖',
  'Creative work 🎨',
];

const APP_DISPLAY: Record<string, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  reddit: 'Reddit',
  x: 'X',
  facebook: 'Facebook',
};

// ─── Permission status type ───────────────────────────────────────────────────

type PermStatus = 'checking' | 'all_granted' | 'need_usage' | 'need_overlay' | 'need_both';

// ─── Permission banner ────────────────────────────────────────────────────────

function PermissionBanner({
  status,
  onRequestUsage,
  onRequestOverlay,
  onRecheck,
  rechecking,
}: {
  status: PermStatus;
  onRequestUsage: () => void;
  onRequestOverlay: () => void;
  onRecheck: () => void;
  rechecking: boolean;
}) {
  if (status === 'all_granted' || status === 'checking') return null;

  const needUsage   = status === 'need_usage'   || status === 'need_both';
  const needOverlay = status === 'need_overlay' || status === 'need_both';

  return (
    <View style={perm.banner}>
      <BlurView intensity={blur.tile} tint="dark" style={StyleSheet.absoluteFill} />

      <Text style={perm.title}>
        {'\u26a0\ufe0f'} Permissions needed to block apps
      </Text>
      <Text style={perm.sub}>
        Without these, COOKED can{'\u2019'}t stop you from opening blocked apps.
      </Text>

      {/* Usage Access */}
      <View style={perm.row}>
        <View style={perm.rowLeft}>
          <Text style={perm.rowIcon}>{needUsage ? '🔴' : '✅'}</Text>
          <View style={perm.rowCopy}>
            <Text style={perm.rowTitle}>Usage Access</Text>
            <Text style={perm.rowSub}>Lets COOKED see which app is open</Text>
          </View>
        </View>
        {needUsage && (
          <Pressable onPress={onRequestUsage} style={perm.grantBtn}>
            <Text style={perm.grantText}>Grant</Text>
          </Pressable>
        )}
      </View>

      {/* Overlay */}
      <View style={[perm.row, { borderTopWidth: 1, borderTopColor: colors.glassLine }]}>
        <View style={perm.rowLeft}>
          <Text style={perm.rowIcon}>{needOverlay ? '🔴' : '✅'}</Text>
          <View style={perm.rowCopy}>
            <Text style={perm.rowTitle}>Draw Over Apps</Text>
            <Text style={perm.rowSub}>Shows the blocking screen when you stray</Text>
          </View>
        </View>
        {needOverlay && (
          <Pressable onPress={onRequestOverlay} style={perm.grantBtn}>
            <Text style={perm.grantText}>Grant</Text>
          </Pressable>
        )}
      </View>

      {/* Re-check after granting */}
      <Pressable
        onPress={onRecheck}
        style={perm.recheckBtn}
        disabled={rechecking}
      >
        {rechecking
          ? <ActivityIndicator size="small" color={colors.mint} />
          : <Text style={perm.recheckText}>I granted them {'\u2014'} check again</Text>}
      </Pressable>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function FocusSetupScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const { blockedApps, setBlockedApps } = useBlockedAppsStore();
  const { setTask }                     = useFocusTaskStore();
  const { minutes, setMinutes }         = useFocusDurationStore();
  const { allowBrowser, setAllowBrowser } = useAllowBrowserStore();

  const [task, setTaskLocal]    = useState('');
  const [selected, setSelected] = useState<string[]>(blockedApps);
  const [permStatus, setPermStatus] = useState<PermStatus>('checking');
  const [rechecking, setRechecking] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // ── Check permissions on mount and after returning from settings ────────────
  async function checkPerms() {
    if (Platform.OS !== 'android') {
      setPermStatus('all_granted');
      return;
    }
    const { usage, overlay } = await checkBlockingPermissions();
    if (usage && overlay)   setPermStatus('all_granted');
    else if (!usage && !overlay) setPermStatus('need_both');
    else if (!usage)             setPermStatus('need_usage');
    else                         setPermStatus('need_overlay');
  }

  useEffect(() => {
    // Initial check — deferred so it runs after first render
    const timer = setTimeout(() => { checkPerms(); }, 0);
    // Re-check whenever a deep-link fires (user returning from settings)
    const sub = Linking.addEventListener('url', () => { checkPerms(); });
    return () => { clearTimeout(timer); sub.remove(); };
  }, []); // checkPerms is stable (no deps)

  async function handleRecheck() {
    setRechecking(true);
    await checkPerms();
    setRechecking(false);
  }

  // ── Toggle blocked app ───────────────────────────────────────────────────────
  function toggle(key: string) {
    Haptics.selectionAsync();
    setSelected((curr) =>
      curr.includes(key) ? curr.filter((k) => k !== key) : [...curr, key]
    );
  }

  // ── Start session ────────────────────────────────────────────────────────────
  async function handleStart() {
    if (isStarting || !task.trim()) { if (!task.trim()) inputRef.current?.focus(); return; }
    setIsStarting(true);

    // Re-check permissions one last time before starting
    if (Platform.OS === 'android') {
      const { usage, overlay } = await checkBlockingPermissions();
      if (!usage || !overlay) {
        await checkPerms(); // update banner
        setIsStarting(false); // was never reset here — Start stayed disabled forever
        return;
      }
      await requestNotificationPermission(); // Android 13+ needs this for roast notifications
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // This is the ONLY place a focus session is created. The DB row is
    // created here, BEFORE we navigate — the Focus tab never creates a
    // session on its own, it only ever reads/recovers one that already
    // exists (see FocusScreen). If this RPC fails (offline, auth issue,
    // one already open), we do not navigate and nothing starts blocking.
    const { session, error } = await startFocusSession({
      id: generateUUID(),
      task: task.trim(),
      plannedSeconds: minutes * 60,
      blockedApps: selected,
      allowBrowser,
    });

    if (error || !session) {
      setIsStarting(false);
      Alert.alert('Couldn\u2019t start session', 'Check your connection and try again.');
      return;
    }

    await setBlockedApps(selected);
    setTask(task.trim());
    // "ready" tells the Focus tab this came from a real setup flow, so it
    // starts native blocking instead of redirecting back here. sessionId
    // is the DB row's id — the Focus tab reads the session by id rather
    // than trusting any local state (session.id is the same id we just
    // sent; session.already_active===true only if a race created one first).
    router.replace({
      pathname: '/(tabs)/focus',
      params: { ready: '1', sessionId: session.id },
    });
  }

  const canStart = task.trim().length > 0 && permStatus === 'all_granted' && !isStarting;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.screen}>
        <AppBackground />
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scroll,
              { paddingBottom: insets.bottom + 120 },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
              <Text style={styles.eyebrow}>NEW SESSION</Text>
              <Text style={styles.headline}>What are you working on?</Text>
              <Text style={styles.sub}>
                Be specific. {'\u201c'}Deep work{'\u201d'} beats {'\u201c'}stuff{'\u201d'}.
              </Text>
            </View>

            {/* Permission banner — shown when any permission is missing */}
            <PermissionBanner
              status={permStatus}
              onRequestUsage={openScreenTimeSettings}
              onRequestOverlay={requestOverlayPermission}
              onRecheck={handleRecheck}
              rechecking={rechecking}
            />

            {/* Task input */}
            <View style={styles.inputWrap}>
              <BlurView intensity={blur.tile} tint="dark" style={StyleSheet.absoluteFill} />
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={task}
                onChangeText={setTaskLocal}
                placeholder="e.g. Finish the backend PR"
                placeholderTextColor={colors.muted}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                autoFocus
                maxLength={60}
              />
              {task.length > 0 && (
                <Pressable
                  onPress={() => setTaskLocal('')}
                  style={styles.clearBtn}
                  hitSlop={10}
                >
                  <Text style={styles.clearText}>✕</Text>
                </Pressable>
              )}
            </View>

            {/* Quick suggestions */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {TASK_SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => { setTaskLocal(s); Keyboard.dismiss(); }}
                  style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                >
                  <Text style={styles.chipText}>{s}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Blocked apps */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>APPS BLOCKED DURING SESSION</Text>
              <View style={styles.appGrid}>
                {APPS.map((app) => {
                  const isBlocked = selected.includes(app.key);
                  return (
                    <Pressable
                      key={app.key}
                      onPress={() => toggle(app.key)}
                      style={({ pressed }) => [
                        styles.appCard,
                        isBlocked && styles.appCardBlocked,
                        pressed && styles.chipPressed,
                      ]}
                    >
                      <BlurView intensity={blur.tile} tint="dark" style={StyleSheet.absoluteFill} />
                      <BrandIcon brand={app.key} size={32} drained={isBlocked} />
                      <Text style={[styles.appName, isBlocked && styles.appNameBlocked]}>
                        {APP_DISPLAY[app.key] ?? app.name}
                      </Text>
                      {isBlocked && (
                        <View style={styles.blockedBadge}>
                          <Text style={styles.blockedBadgeText}>OFF</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
              {selected.length === 0 && (
                <Text style={styles.noAppsHint}>
                  No apps selected — nothing will be blocked this session.
                </Text>
              )}
            </View>

            {/* Session length */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>SESSION LENGTH</Text>
              <View style={styles.durationRow}>
                {SESSION_DURATION_OPTIONS.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => { Haptics.selectionAsync(); setMinutes(m); }}
                    style={({ pressed }) => [
                      styles.durationChip,
                      minutes === m && styles.durationChipActive,
                      pressed && styles.chipPressed,
                    ]}
                  >
                    <Text style={[styles.durationChipText, minutes === m && styles.durationChipTextActive]}>
                      {m} min
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Allow browser toggle */}
            <View style={styles.section}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setAllowBrowser(!allowBrowser); }}
                style={styles.browserToggleRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>ALLOW BROWSER</Text>
                  <Text style={styles.browserToggleDesc}>
                    For research or study sessions that need one. Off by default.
                  </Text>
                </View>
                <View style={[styles.toggleTrack, allowBrowser && styles.toggleTrackOn]}>
                  <View style={[styles.toggleThumb, allowBrowser && styles.toggleThumbOn]} />
                </View>
              </Pressable>
            </View>
          </ScrollView>

          {/* Fixed bottom CTA */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
            <BlurView intensity={blur.bar} tint="dark" style={StyleSheet.absoluteFill} />
            <Pressable
              onPress={handleStart}
              disabled={!canStart}
              style={({ pressed }) => [
                styles.startBtn,
                !canStart && styles.startBtnDisabled,
                pressed && canStart && styles.startBtnPressed,
              ]}
            >
              <Text style={[styles.startLabel, !canStart && styles.startLabelDisabled]}>
                {permStatus !== 'all_granted' && permStatus !== 'checking'
                  ? 'Grant permissions above to start'
                  : task.trim()
                    ? `Lock in \u2192 ${task.trim()}`
                    : 'Tell us what you\u2019re doing first'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}

// ─── Permission banner styles ──────────────────────────────────────────────────

const perm = StyleSheet.create({
  banner:      { borderRadius: radius.field, overflow: 'hidden', borderWidth: 1,
                 borderColor: 'rgba(240,179,108,0.4)', gap: space.sm, padding: space.md },
  title:       { color: colors.ember, fontFamily: font.bodySemi, fontSize: 14 },
  sub:         { color: colors.textDim, fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  row:         { flexDirection: 'row', alignItems: 'center',
                 justifyContent: 'space-between', paddingTop: space.sm, gap: space.sm },
  rowLeft:     { flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1 },
  rowIcon:     { fontSize: 16 },
  rowCopy:     { flex: 1, gap: 2 },
  rowTitle:    { color: colors.text, fontFamily: font.bodySemi, fontSize: 14 },
  rowSub:      { color: colors.muted, fontFamily: font.body, fontSize: 12 },
  grantBtn:    { backgroundColor: colors.ember, borderRadius: radius.pill,
                 paddingHorizontal: 14, paddingVertical: 7 },
  grantText:   { color: colors.ink, fontFamily: font.bodySemi, fontSize: 13 },
  recheckBtn:  { alignItems: 'center', paddingTop: space.sm, minHeight: 32,
                 justifyContent: 'center' },
  recheckText: { color: colors.mint, fontFamily: font.bodySemi, fontSize: 13 },
});

// ─── Screen styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:            { flex: 1, backgroundColor: colors.ink },
  kav:               { flex: 1 },
  scroll:            { gap: space.lg, paddingHorizontal: space.lg },
  header:            { gap: space.xs },
  eyebrow:           { color: colors.mint, fontFamily: font.bodySemi,
                       fontSize: 11, letterSpacing: 3.4 },
  headline:          { color: colors.text, fontFamily: font.displayHeavy,
                       fontSize: 30, letterSpacing: -0.5, lineHeight: 36 },
  sub:               { color: colors.textDim, fontFamily: font.body,
                       fontSize: 15, lineHeight: 22 },
  inputWrap:         { borderRadius: radius.field, overflow: 'hidden',
                       borderWidth: 1, borderColor: colors.glassLineStrong,
                       flexDirection: 'row', alignItems: 'center' },
  input:             { flex: 1, color: colors.text, fontFamily: font.display,
                       fontSize: 18, padding: space.md, minHeight: 56 },
  clearBtn:          { paddingHorizontal: space.md },
  clearText:         { color: colors.muted, fontSize: 14 },
  chips:             { gap: space.sm, paddingRight: space.lg },
  chip:              { borderRadius: radius.pill, borderWidth: 1,
                       borderColor: colors.glassLine, paddingHorizontal: 14,
                       paddingVertical: 8, backgroundColor: colors.glass },
  chipPressed:       { opacity: 0.7 },
  chipText:          { color: colors.textDim, fontFamily: font.bodyMedium, fontSize: 13 },
  section:           { gap: space.sm },
  sectionTitle:      { color: colors.muted, fontFamily: font.bodyMedium,
                       fontSize: 11, letterSpacing: 2 },
  appGrid:           { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  appCard:           { width: '30%', borderRadius: radius.field - 4, overflow: 'hidden',
                       borderWidth: 1, borderColor: colors.glassLine,
                       alignItems: 'center', padding: space.sm, gap: 6,
                       backgroundColor: colors.glass },
  appCardBlocked:    { borderColor: colors.accentLine },
  appName:           { color: colors.textDim, fontFamily: font.bodyMedium, fontSize: 12 },
  appNameBlocked:    { color: colors.mint },
  blockedBadge:      { backgroundColor: colors.mint, borderRadius: radius.pill,
                       paddingHorizontal: 6, paddingVertical: 2 },
  blockedBadgeText:  { color: colors.ink, fontFamily: font.bodySemi,
                       fontSize: 9, letterSpacing: 1 },
  noAppsHint:        { color: colors.muted, fontFamily: font.body, fontSize: 12,
                       textAlign: 'center' },
  durationRow:       { flexDirection: 'row', gap: space.sm },
  durationChip:      { flex: 1, borderRadius: radius.pill, borderWidth: 1,
                       borderColor: colors.glassLine, paddingVertical: 10,
                       alignItems: 'center' },
  durationChipActive:{ backgroundColor: colors.mint, borderColor: colors.mint },
  durationChipText:  { color: colors.textDim, fontFamily: font.bodyMedium, fontSize: 13 },
  durationChipTextActive: { color: colors.ink },
  browserToggleRow:  { flexDirection: 'row', alignItems: 'center', gap: space.md },
  browserToggleDesc: { color: colors.muted, fontFamily: font.body, fontSize: 12,
                       marginTop: 2, lineHeight: 16 },
  toggleTrack:       { width: 44, height: 26, borderRadius: 13,
                       backgroundColor: colors.glassLine, padding: 3, justifyContent: 'center' },
  toggleTrackOn:     { backgroundColor: colors.mint },
  toggleThumb:       { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textDim },
  toggleThumbOn:     { backgroundColor: colors.ink, alignSelf: 'flex-end' },
  footer:            { position: 'absolute', bottom: 0, left: 0, right: 0,
                       paddingHorizontal: space.lg, paddingTop: space.md,
                       overflow: 'hidden', borderTopWidth: 1,
                       borderTopColor: colors.glassLine },
  startBtn:          { backgroundColor: colors.mint, borderRadius: radius.pill,
                       height: 58, alignItems: 'center', justifyContent: 'center',
                       paddingHorizontal: space.lg },
  startBtnDisabled:  { backgroundColor: colors.glass, borderWidth: 1,
                       borderColor: colors.glassLine },
  startBtnPressed:   { opacity: 0.85 },
  startLabel:        { color: colors.ink, fontFamily: font.display,
                       fontSize: 16, letterSpacing: 0.2 },
  startLabelDisabled: { color: colors.muted, fontFamily: font.body },
});
