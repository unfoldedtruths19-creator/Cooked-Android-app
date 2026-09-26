import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';

import { Panel, PanelFoot, row } from './panel';
import { formatSpan, type Goal } from './plan-data';
import { colors, font, space } from '@/theme/tokens';

/**
 * Counts from the last rendered value to the new one so the total reads as a
 * consequence of the tap, not a number that swapped. Instant under reduce motion.
 */
function useCountUp(target: number) {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    const duration = reduceMotion ? 0 : 300;

    let frame = 0;
    let started = 0;
    function step(now: number) {
      if (!started) started = now;
      const progress = duration === 0 ? 1 : Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const next = Math.round(from + (target - from) * eased);
      current.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, target]);

  return value;
}

/** Goals as a ledger: every line carries the time it buys back, the foot keeps the running total. */
export function GoalLedger({
  goals,
  selected,
  onToggle,
}: {
  goals: readonly Goal[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  const target = goals
    .filter((goal) => selected.includes(goal.key))
    .reduce((sum, goal) => sum + goal.minutes, 0);
  const total = useCountUp(target);

  return (
    <Panel unit="PER WEEK">
      {goals.map((goal, index) => {
        const picked = selected.includes(goal.key);
        return (
          <Pressable
            key={goal.key}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: picked }}
            accessibilityLabel={`${goal.title}, ${formatSpan(goal.minutes)} per week`}
            onPress={() => onToggle(goal.key)}
            style={({ pressed }) => [
              styles.row,
              index > 0 && row.divided,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.rail, picked && styles.railOn]} />
            <View style={styles.copy}>
              <Text style={[styles.title, picked && styles.titleOn]}>{goal.title}</Text>
              <Text style={styles.note}>{goal.note}</Text>
            </View>
            <Text style={[styles.figure, picked && styles.figureOn]}>
              {formatSpan(goal.minutes)}
            </Text>
          </Pressable>
        );
      })}

      <PanelFoot label="Total back" value={formatSpan(total)} empty={target === 0} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md - 2,
    paddingHorizontal: space.md,
  },
  rail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: 'transparent',
  },
  railOn: {
    backgroundColor: colors.mint,
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: colors.textDim,
    fontFamily: font.display,
    fontSize: 17,
    letterSpacing: -0.2,
  },
  titleOn: {
    color: colors.text,
  },
  note: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 12.5,
    lineHeight: 17,
  },
  figure: {
    color: colors.muted,
    fontFamily: font.display,
    fontSize: 16,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  figureOn: {
    color: colors.mint,
  },
  pressed: {
    opacity: 0.75,
  },
});
