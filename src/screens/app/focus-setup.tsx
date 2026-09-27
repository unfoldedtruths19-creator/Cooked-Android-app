import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
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
import { APPS, LEVELS, type LevelKey, goalsFor, levelFor } from '@/screens/onboarding/plan-data';
import {
  checkBlockingPermissions,
  openScreenTimeSettings,
  requestOverlayPermission,
  requestNotificationPermission,
} from '@/services/screenTimeNative';
import { generateUUID, startFocusSession } from '@/lib/focus';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Constants ────────────────────────────────────────────────────────────────

const ONBOARDING_PREFS_KEY = 'cooked_focus_onboarding_done';

const APP_DISPLAY: Record<string, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  reddit: 'Reddit',
  x: 'X',
  facebook: 'Facebook',
};

const TASK_SUGGESTIONS = [
  'Deep work 🧠',
  'Study session 📚',
  'Writing ✍️',
  'Project work 💻',
  'Reading 📖',
  'Creative work 🎨',
];

const GOALS = [
  { key: 'study',     title: 'Study',          emoji: '📚', desc: 'Lock in for exams or coursework' },
  { key: 'deepwork',  title: 'Deep work',      emoji: '🧠', desc: 'Uninterrupted creative or coding time' },
  { key: 'reduce',    title: 'Reduce distractions', emoji: '🔇', desc: 'Stop the mindless scrolling' },
  { key: 'reading',   title: 'Reading',         emoji: '📖', desc: 'Books, articles, research' },
  { key: 'wellness',  title: 'Wellness',        emoji: '🧘', desc: 'Meditation, exercise, journaling' },
];

type Step = 'level' | 'goal' | 'apps' | 'plan';
const STEPS: Step[] = ['level', 'goal', 'apps', 'plan'];

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

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.stepRow}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.stepDot,
            i + 1 === current && styles.stepDotActive,
            i + 1 < current && styles.stepDotDone,
          ]}
        />
      ))}
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

  // State
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>('level');
  const [focusLevel, setFocusLevel] = useState<LevelKey | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [selectedApps, setSelectedApps] = useState<string[]>(blockedApps);
  const [task, setTaskLocal] = useState('');
  const [permStatus, setPermStatus] = useState<PermStatus>('checking');
  const [rechecking, setRechecking] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // Animation
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // ── Check if user has completed focus onboarding before ────────────────
  useEffect(() => {
    (async () => {
      try {
        const done = await AsyncStorage.getItem(ONBOARDING_PREFS_KEY);
        setHasOnboarded(done === '1');
        // If returning user, skip to plan step
        if (done === '1') {
          setStep('plan');
          // Load their saved focus level and goal
          const savedLevel = await AsyncStorage.getItem('cooked_focus_level');
          const savedGoal = await AsyncStorage.getItem('cooked_focus_goal');
          if (savedLevel) setFocusLevel(savedLevel as LevelKey);
          if (savedGoal) setSelectedGoal(savedGoal);
        }
      } catch {
        setHasOnboarded(true); // fail open
        setStep('plan');
      }
    })();
  }, []);

  // ── Check permissions ─────────────────────────────────────────────────
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
    const timer = setTimeout(() => { checkPerms(); }, 0);
    const sub = Linking.addEventListener('url', () => { checkPerms(); });
    return () => { clearTimeout(timer); sub.remove(); };
  }, []);

  async function handleRecheck() {
    setRechecking(true);
    await checkPerms();
    setRechecking(false);
  }

  // ── Step transitions ──────────────────────────────────────────────────
  function animateTransition(nextStep: Step) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
    setTimeout(() => setStep(nextStep), 120);
  }

  function handleNext() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      animateTransition(STEPS[idx + 1]);
    }
  }

  function handleBack() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) {
      animateTransition(STEPS[idx - 1]);
    } else {
      router.back();
    }
  }

  // ── Toggle blocked app ────────────────────────────────────────────────
  function toggleApp(key: string) {
    Haptics.selectionAsync();
    setSelectedApps((curr) =>
      curr.includes(key) ? curr.filter((k) => k !== key) : [...curr, key]
    );
  }

  // ── Start session ─────────────────────────────────────────────────────
  async function handleStart() {
    if (isStarting || !task.trim()) { if (!task.trim()) inputRef.current?.focus(); return; }
    setIsStarting(true);

    // Save onboarding preferences
    try {
      await AsyncStorage.setItem(ONBOARDING_PREFS_KEY, '1');
      if (focusLevel) await AsyncStorage.setItem('cooked_focus_level', focusLevel);
      if (selectedGoal) await AsyncStorage.setItem('cooked_focus_goal', selectedGoal);
    } catch {}

    // Re-check permissions one last time before starting
    if (Platform.OS === 'android') {
      const { usage, overlay } = await checkBlockingPermissions();
      if (!usage || !overlay) {
        await checkPerms();
        setIsStarting(false);
        return;
      }
      await requestNotificationPermission();
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const { session, error } = await startFocusSession({
      id: generateUUID(),
      task: task.trim(),
      plannedSeconds: minutes * 60,
      blockedApps: selectedApps,
      allowBrowser,
    });

    if (error || !session) {
      setIsStarting(false);
      Alert.alert('Couldn\u2019t start session', 'Check your connection and try again.');
      return;
    }

    await setBlockedApps(selectedApps);
    setTask(task.trim());
    router.replace({
      pathname: '/(tabs)/focus',
      params: { ready: '1', sessionId: session.id },
    });
  }

  // ── Can continue to next step ─────────────────────────────────────────
  function canContinue(): boolean {
    switch (step) {
      case 'level': return focusLevel !== null;
      case 'goal': return selectedGoal !== null;
      case 'apps': return true; // Can proceed with no apps (just won't block)
      case 'plan': return task.trim().length > 0 && permStatus === 'all_granted' && !isStarting;
      default: return false;
    }
  }

  const stepIndex = STEPS.indexOf(step) + 1;

  if (hasOnboarded === null) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <AppBackground />
        <ActivityIndicator size="large" color={colors.mint} />
      </View>
    );
  }

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
              {/* Back button */}
              <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={10}>
                <SymbolView
                  name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }}
                  tintColor={colors.text}
                  size={18}
                />
              </Pressable>

              {/* Step indicator - only show during onboarding */}
              {!hasOnboarded && step !== 'plan' && (
                <StepIndicator current={stepIndex} total={4} />
              )}
            </View>

            <Animated.View style={{ opacity: fadeAnim }}>
              {/* ═══════════════ STEP 1: Focus Level ═══════════════ */}
              {step === 'level' && (
                <View style={styles.stepContent}>
                  <Text style={styles.eyebrow}>HOW DISTRACTED ARE YOU?</Text>
                  <Text style={styles.headline}>Pick your focus{'\n'}intensity</Text>
                  <Text style={styles.sub}>
                    This helps COOKED calibrate your session. Be honest — no judgment.
                  </Text>

                  <View style={styles.levelGrid}>
                    {LEVELS.map((level) => {
                      const active = focusLevel === level.key;
                      return (
                        <Pressable
                          key={level.key}
                          onPress={() => { Haptics.selectionAsync(); setFocusLevel(level.key); }}
                          style={[styles.levelCard, active && { borderColor: level.color }]}
                        >
                          <BlurView intensity={blur.tile} tint="dark" style={StyleSheet.absoluteFill} />
                          <View style={styles.levelHeader}>
                            <Text style={[styles.levelTitle, active && { color: level.color }]}>
                              {level.title}
                            </Text>
                            <Text style={styles.levelBand}>{level.band}</Text>
                          </View>
                          <Text style={styles.levelNote}>{level.note}</Text>
                          {active && (
                            <View style={[styles.levelIndicator, { backgroundColor: level.color }]}>
                              <Text style={styles.levelIndicatorText}>✓</Text>
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* ═══════════════ STEP 2: Goal ═══════════════ */}
              {step === 'goal' && (
                <View style={styles.stepContent}>
                  <Text style={styles.eyebrow}>WHAT ARE YOU FOCUSING ON?</Text>
                  <Text style={styles.headline}>Pick your goal</Text>
                  <Text style={styles.sub}>
                    This shapes your session. You can always change it later.
                  </Text>

                  <View style={styles.goalList}>
                    {GOALS.map((goal) => {
                      const active = selectedGoal === goal.key;
                      return (
                        <Pressable
                          key={goal.key}
                          onPress={() => { Haptics.selectionAsync(); setSelectedGoal(goal.key); }}
                          style={[styles.goalCard, active && styles.goalCardActive]}
                        >
                          <BlurView intensity={blur.tile} tint="dark" style={StyleSheet.absoluteFill} />
                          <Text style={styles.goalEmoji}>{goal.emoji}</Text>
                          <View style={styles.goalCopy}>
                            <Text style={[styles.goalTitle, active && styles.goalTitleActive]}>
                              {goal.title}
                            </Text>
                            <Text style={styles.goalDesc}>{goal.desc}</Text>
                          </View>
                          {active && (
                            <View style={styles.goalCheck}>
                              <Text style={styles.goalCheckText}>✓</Text>
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* ═══════════════ STEP 3: Apps to Block ═══════════════ */}
              {step === 'apps' && (
                <View style={styles.stepContent}>
                  <Text style={styles.eyebrow}>APPS TO BLOCK</Text>
                  <Text style={styles.headline}>Which apps distract{'\n'}you most?</Text>
                  <Text style={styles.sub}>
                    These will be blocked during your focus session. Pick the ones you open without thinking.
                  </Text>

                  <View style={styles.appGrid}>
                    {APPS.map((app) => {
                      const isBlocked = selectedApps.includes(app.key);
                      return (
                        <Pressable
                          key={app.key}
                          onPress={() => toggleApp(app.key)}
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
                              <Text style={styles.blockedBadgeText}>BLOCKED</Text>
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                  {selectedApps.length === 0 && (
                    <Text style={styles.noAppsHint}>
                      No apps selected — nothing will be blocked this session.
                    </Text>
                  )}
                </View>
              )}

              {/* ═══════════════ STEP 4: Your Focus Plan ═══════════════ */}
              {step === 'plan' && (
                <View style={styles.stepContent}>
                  <Text style={styles.eyebrow}>YOUR FOCUS PLAN</Text>
                  <Text style={styles.headline}>Lock in</Text>
                  <Text style={styles.sub}>
                    Confirm your setup and start focusing.
                  </Text>

                  {/* Saved preferences summary — tappable to edit */}
                  {hasOnboarded && (
                    <View style={styles.savedPrefs}>
                      {focusLevel && (
                        <Pressable
                          onPress={() => animateTransition('level')}
                          style={styles.prefRow}
                        >
                          <View style={styles.prefLeft}>
                            <Text style={styles.prefLabel}>Intensity</Text>
                            <Text style={styles.prefValue}>{levelFor(focusLevel).title}</Text>
                          </View>
                          <SymbolView
                            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                            tintColor={colors.muted}
                            size={14}
                          />
                        </Pressable>
                      )}
                      {selectedGoal && (
                        <Pressable
                          onPress={() => animateTransition('goal')}
                          style={styles.prefRow}
                        >
                          <View style={styles.prefLeft}>
                            <Text style={styles.prefLabel}>Goal</Text>
                            <Text style={styles.prefValue}>
                              {GOALS.find(g => g.key === selectedGoal)?.title ?? selectedGoal}
                            </Text>
                          </View>
                          <SymbolView
                            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                            tintColor={colors.muted}
                            size={14}
                          />
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => animateTransition('apps')}
                        style={styles.prefRow}
                      >
                        <View style={styles.prefLeft}>
                          <Text style={styles.prefLabel}>Blocked apps</Text>
                          <Text style={styles.prefValue}>
                            {selectedApps.length === 0
                              ? 'None'
                              : selectedApps.map(k => APP_DISPLAY[k] ?? k).join(', ')}
                          </Text>
                        </View>
                        <SymbolView
                          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                          tintColor={colors.muted}
                          size={14}
                        />
                      </Pressable>
                    </View>
                  )}

                  {/* Permission banner — shown when any permission is missing */}
                  <PermissionBanner
                    status={permStatus}
                    onRequestUsage={openScreenTimeSettings}
                    onRequestOverlay={requestOverlayPermission}
                    onRecheck={handleRecheck}
                    rechecking={rechecking}
                  />

                  {/* Task input */}
                  <Text style={styles.sectionTitle}>WHAT ARE YOU WORKING ON?</Text>
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

                  {/* Session length */}
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

                  {/* Allow browser toggle */}
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
              )}
            </Animated.View>
          </ScrollView>

          {/* Fixed bottom CTA */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
            <BlurView intensity={blur.bar} tint="dark" style={StyleSheet.absoluteFill} />
            {step === 'plan' ? (
              <Pressable
                onPress={handleStart}
                disabled={!canContinue()}
                style={({ pressed }) => [
                  styles.startBtn,
                  !canContinue() && styles.startBtnDisabled,
                  pressed && canContinue() && styles.startBtnPressed,
                ]}
              >
                {isStarting ? (
                  <ActivityIndicator color={colors.ink} />
                ) : (
                  <Text style={[styles.startLabel, !canContinue() && styles.startLabelDisabled]}>
                    {permStatus !== 'all_granted' && permStatus !== 'checking'
                      ? 'Grant permissions above to start'
                      : task.trim()
                        ? `Lock in \u2192 ${task.trim()}`
                        : 'Tell us what you\u2019re doing first'}
                  </Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                onPress={handleNext}
                disabled={!canContinue()}
                style={({ pressed }) => [
                  styles.startBtn,
                  !canContinue() && styles.startBtnDisabled,
                  pressed && canContinue() && styles.startBtnPressed,
                ]}
              >
                <Text style={[styles.startLabel, !canContinue() && styles.startLabelDisabled]}>
                  Continue
                </Text>
                <SymbolView
                  name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
                  tintColor={canContinue() ? colors.ink : colors.muted}
                  size={17}
                />
              </Pressable>
            )}
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
  header:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:           { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.glass,
                       borderWidth: 1, borderColor: colors.glassLine,
                       alignItems: 'center', justifyContent: 'center' },

  // Step dots
  stepRow:           { flexDirection: 'row', gap: 5 },
  stepDot:           { width: 14, height: 5, borderRadius: 3,
                       backgroundColor: 'rgba(173, 226, 210, 0.16)' },
  stepDotActive:     { width: 26, backgroundColor: colors.mint },
  stepDotDone:       { backgroundColor: 'rgba(143, 227, 117, 0.45)' },

  // Step content
  stepContent:       { gap: space.lg },
  eyebrow:           { color: colors.mint, fontFamily: font.bodySemi,
                       fontSize: 11, letterSpacing: 3.4 },
  headline:          { color: colors.text, fontFamily: font.displayHeavy,
                       fontSize: 30, letterSpacing: -0.5, lineHeight: 36 },
  sub:               { color: colors.textDim, fontFamily: font.body,
                       fontSize: 15, lineHeight: 22 },

  // Level cards
  levelGrid:         { gap: space.sm },
  levelCard:         { borderRadius: radius.field, overflow: 'hidden',
                       borderWidth: 1.5, borderColor: colors.glassLine,
                       padding: space.md, gap: 6 },
  levelHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  levelTitle:        { color: colors.text, fontFamily: font.display, fontSize: 17 },
  levelBand:         { color: colors.muted, fontFamily: font.bodyMedium, fontSize: 12 },
  levelNote:         { color: colors.textDim, fontFamily: font.body, fontSize: 13 },
  levelIndicator:    { position: 'absolute', top: 12, right: 12, width: 22, height: 22,
                       borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  levelIndicatorText:{ color: colors.ink, fontFamily: font.bodySemi, fontSize: 12 },

  // Goal cards
  goalList:          { gap: space.sm },
  goalCard:          { flexDirection: 'row', alignItems: 'center', gap: space.md,
                       borderRadius: radius.field, overflow: 'hidden',
                       borderWidth: 1.5, borderColor: colors.glassLine,
                       padding: space.md },
  goalCardActive:    { borderColor: colors.mint },
  goalEmoji:         { fontSize: 28 },
  goalCopy:          { flex: 1, gap: 2 },
  goalTitle:         { color: colors.text, fontFamily: font.display, fontSize: 16 },
  goalTitleActive:   { color: colors.mint },
  goalDesc:          { color: colors.textDim, fontFamily: font.body, fontSize: 13 },
  goalCheck:         { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.mint,
                       alignItems: 'center', justifyContent: 'center' },
  goalCheckText:     { color: colors.ink, fontFamily: font.bodySemi, fontSize: 13 },

  // App grid
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
  chipPressed:       { opacity: 0.7 },

  // Plan step — saved prefs
  savedPrefs:        { borderRadius: radius.field, overflow: 'hidden', borderWidth: 1,
                       borderColor: colors.glassLine, backgroundColor: colors.glass },
  prefRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                       paddingHorizontal: space.md, paddingVertical: 14,
                       borderBottomWidth: 1, borderBottomColor: colors.glassLine },
  prefLeft:          { flex: 1, gap: 2 },
  prefLabel:         { color: colors.muted, fontFamily: font.bodyMedium, fontSize: 11,
                       letterSpacing: 1.5 },
  prefValue:         { color: colors.text, fontFamily: font.bodySemi, fontSize: 14 },

  // Task input
  sectionTitle:      { color: colors.muted, fontFamily: font.bodyMedium,
                       fontSize: 11, letterSpacing: 2 },
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
  chipText:          { color: colors.textDim, fontFamily: font.bodyMedium, fontSize: 13 },

  // Duration
  durationRow:       { flexDirection: 'row', gap: space.sm },
  durationChip:      { flex: 1, borderRadius: radius.pill, borderWidth: 1,
                       borderColor: colors.glassLine, paddingVertical: 10,
                       alignItems: 'center' },
  durationChipActive:{ backgroundColor: colors.mint, borderColor: colors.mint },
  durationChipText:  { color: colors.textDim, fontFamily: font.bodyMedium, fontSize: 13 },
  durationChipTextActive: { color: colors.ink },

  // Browser toggle
  browserToggleRow:  { flexDirection: 'row', alignItems: 'center', gap: space.md },
  browserToggleDesc: { color: colors.muted, fontFamily: font.body, fontSize: 12,
                       marginTop: 2, lineHeight: 16 },
  toggleTrack:       { width: 44, height: 26, borderRadius: 13,
                       backgroundColor: colors.glassLine, padding: 3, justifyContent: 'center' },
  toggleTrackOn:     { backgroundColor: colors.mint },
  toggleThumb:       { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textDim },
  toggleThumbOn:     { backgroundColor: colors.ink, alignSelf: 'flex-end' },

  // Footer
  footer:            { position: 'absolute', bottom: 0, left: 0, right: 0,
                       paddingHorizontal: space.lg, paddingTop: space.md,
                       overflow: 'hidden', borderTopWidth: 1,
                       borderTopColor: colors.glassLine },
  startBtn:          { backgroundColor: colors.mint, borderRadius: radius.pill,
                       height: 58, alignItems: 'center', justifyContent: 'center',
                       paddingHorizontal: space.lg, flexDirection: 'row', gap: space.sm },
  startBtnDisabled:  { backgroundColor: colors.glass, borderWidth: 1,
                       borderColor: colors.glassLine },
  startBtnPressed:   { opacity: 0.85 },
  startLabel:        { color: colors.ink, fontFamily: font.display,
                       fontSize: 16, letterSpacing: 0.2 },
  startLabelDisabled: { color: colors.muted, fontFamily: font.body },
});
