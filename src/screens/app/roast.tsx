import { BlurView } from 'expo-blur';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GhostButton, PrimaryButton, Screen } from '@/components/app/ui';
import { roasts, today, worstApp } from '@/data/mock';
import { blur, colors, font, radius, space } from '@/theme/tokens';
import { getRoastFromSummary, type SessionSummary } from '@/state/useFocusSession';

const APP_DISPLAY: Record<string, string> = {
  instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok',
  reddit: 'Reddit', x: 'X', facebook: 'Facebook',
};

function formatDuration(ms: number) {
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function ReceiptRow({ label, value, accent = false }: {
  label: string; value: string; accent?: boolean;
}) {
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptKey}>{label}</Text>
      <Text style={[styles.receiptValue, accent && styles.receiptAccent]}>{value}</Text>
    </View>
  );
}

export function RoastScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    attemptCount?: string;
    sessionDurationMs?: string;
    lastAttemptApp?: string;
    lastWasBrowser?: string;
    task?: string;
    todayScreenMinutes?: string;
    todayPickups?: string;
    todayCookedScore?: string;
    todayTopAppName?: string;
    todayTopAppOpens?: string;
  }>();

  const hasSummary = params.attemptCount !== undefined;
  const summary: SessionSummary | null = hasSummary
    ? {
        attemptCount:      parseInt(params.attemptCount ?? '0', 10),
        sessionDurationMs: parseInt(params.sessionDurationMs ?? '0', 10),
        lastAttemptApp:    params.lastAttemptApp ?? '',
        lastWasBrowser:    params.lastWasBrowser === '1',
      }
    : null;

  // Today's real numbers, passed in from the Today screen's roast card —
  // previously this screen fell back to hardcoded mock data whenever it
  // wasn't opened right after a focus session, so the "roast" never matched
  // what the person actually saw on their dashboard.
  const hasTodayStats = params.todayScreenMinutes !== undefined;
  const todayReal = hasTodayStats
    ? {
        screenTimeMinutes: parseInt(params.todayScreenMinutes ?? '0', 10),
        pickups:     parseInt(params.todayPickups ?? '0', 10),
        cookedScore: parseInt(params.todayCookedScore ?? '0', 10),
        topAppName:  params.todayTopAppName || null,
        topAppOpens: parseInt(params.todayTopAppOpens ?? '0', 10),
      }
    : null;

  const [mockIndex, setMockIndex] = useState(0);
  const mockRoast = roasts[mockIndex % roasts.length];
  // Mirrors the same three branches as the teaser copy on the Today screen's
  // roast card (top app / hours logged / nothing yet) — previously only the
  // first branch was reconstructed here, so opening the card when the user
  // had no standout "top app" (but did have screen time, or had none at all)
  // still landed on an unrelated random mock roast that contradicted what
  // they'd just read on the card.
  const roast = summary
    ? getRoastFromSummary(summary)
    : todayReal?.topAppName
      ? {
          hook: 'BRO.',
          body: `You opened ${todayReal.topAppName} ${todayReal.topAppOpens} times today. That's basically a part-time job.`,
          kicker: 'Do better tomorrow.',
        }
      : todayReal && todayReal.screenTimeMinutes > 0
        ? {
            hook: 'BE HONEST.',
            body: `${Math.round(todayReal.screenTimeMinutes / 60)}h of screen time today. Your thumb did more reps than you did.`,
            kicker: 'Tomorrow, beat it.',
          }
        : todayReal
          ? {
              hook: 'SUSPICIOUS.',
              body: "No screen time logged yet today. Either you're locked in, or something's not syncing.",
              kicker: 'Check back later.',
            }
          : mockRoast;

  function goToFocus() {
    router.replace('/focus-setup');
  }

  function goToToday() {
    router.replace('/(tabs)/today');
  }

  return (
    <Screen style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.hook}>{roast.hook}</Text>
        <Text style={styles.line}>{roast.body}</Text>
        <Text style={styles.kicker}>{roast.kicker}</Text>

        <View style={styles.receipts}>
          <BlurView intensity={blur.tile} tint="dark" style={StyleSheet.absoluteFill} />
          <Text style={styles.receiptsLabel}>THE RECEIPTS</Text>

          {summary ? (
            <>
              {params.task ? (
                <ReceiptRow label="You were working on" value={params.task} />
              ) : null}
              <ReceiptRow
                label="Blocked attempts"
                value={String(summary.attemptCount)}
                accent={summary.attemptCount > 3}
              />
              <ReceiptRow
                label="Session length"
                value={formatDuration(summary.sessionDurationMs)}
              />
              {summary.lastAttemptApp ? (
                <ReceiptRow
                  label="Most tried"
                  value={APP_DISPLAY[summary.lastAttemptApp] ?? summary.lastAttemptApp}
                  accent
                />
              ) : null}
              {summary.lastWasBrowser && (
                <ReceiptRow label="Browser attempt" value="Yes 💀" accent />
              )}
            </>
          ) : todayReal ? (
            <>
              {todayReal.topAppName ? (
                <ReceiptRow
                  label={`${todayReal.topAppName} opens`}
                  value={String(todayReal.topAppOpens)}
                />
              ) : (
                <ReceiptRow
                  label="Screen time"
                  value={formatDuration(todayReal.screenTimeMinutes * 60_000)}
                />
              )}
              <ReceiptRow label="Pickups" value={String(todayReal.pickups)} />
              <ReceiptRow label="Cooked score" value={`${todayReal.cookedScore}%`} accent />
            </>
          ) : (
            <>
              <ReceiptRow label={`${worstApp.name} opens`} value={String(worstApp.opens)} />
              <ReceiptRow label="Pickups" value={String(today.pickups)} />
              <ReceiptRow label="Cooked score" value={`${today.cookedScore}%`} accent />
            </>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        <PrimaryButton
          label="PROVE IT WRONG"
          icon={{ ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }}
          onPress={goToFocus}
        />
        {hasSummary || hasTodayStats ? (
          <GhostButton label="Back to Today" onPress={goToToday} />
        ) : (
          <GhostButton label="Hit me again" onPress={() => setMockIndex((v) => v + 1)} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen:        { justifyContent: 'space-between', paddingBottom: space.xl },
  body:          { flex: 1, justifyContent: 'center', gap: space.md },
  hook:          { color: colors.mint, fontFamily: font.displayHeavy, fontSize: 46, letterSpacing: -1 },
  line:          { color: colors.text, fontFamily: font.display, fontSize: 27, lineHeight: 35, letterSpacing: -0.5 },
  kicker:        { color: colors.muted, fontFamily: font.body, fontSize: 15 },
  receipts:      { marginTop: space.lg, backgroundColor: colors.glass,
                   borderRadius: radius.card - 6, borderCurve: 'continuous',
                   borderWidth: 1, borderColor: colors.glassLine,
                   overflow: 'hidden', padding: space.md, gap: space.sm },
  receiptsLabel: { color: colors.muted, fontFamily: font.bodyMedium, fontSize: 10.5, letterSpacing: 1.8, marginBottom: 2 },
  receiptRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  receiptKey:    { color: colors.textDim, fontFamily: font.body, fontSize: 14 },
  receiptValue:  { color: colors.text, fontFamily: font.displayHeavy, fontSize: 16 },
  receiptAccent: { color: colors.mint },
  actions:       { gap: space.sm },
});
