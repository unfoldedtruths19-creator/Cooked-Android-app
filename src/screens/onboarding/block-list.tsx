import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Panel, PanelFoot, row } from './panel';
import { APPS, formatSpan } from './plan-data';
import { BrandIcon } from '@/components/app/brand-icon';
import { colors, font, space } from '@/theme/tokens';

const PEAK = Math.max(...APPS.map((app) => app.minutes));

/**
 * Each app shows the slice of the day it takes, drawn in its own brand colour.
 * Blocking one drains the colour out of it — the row goes grey and the bar goes
 * mint, so the list reads as the feed losing its grip rather than a form filling in.
 */
export function BlockList({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (key: string) => void;
}) {
  const total = APPS.filter((app) => selected.includes(app.key)).reduce(
    (sum, app) => sum + app.minutes,
    0,
  );

  return (
    <Panel unit="A DAY">
      {APPS.map((app, index) => {
        const blocked = selected.includes(app.key);
        return (
          <Pressable
            key={app.key}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: blocked }}
            accessibilityLabel={`${app.name}, ${app.minutes} minutes a day`}
            onPress={() => onToggle(app.key)}
            style={({ pressed }) => [
              styles.row,
              index > 0 && row.divided,
              pressed && styles.pressed,
            ]}
          >
            <BrandIcon brand={app.key} size={42} drained={blocked} />
            <View style={styles.copy}>
              <View style={styles.head}>
                <Text style={[styles.name, blocked && styles.nameBlocked]}>{app.name}</Text>
                <Text style={[styles.minutes, blocked && styles.minutesBlocked]}>
                  {blocked ? 'Blocked' : `${app.minutes}m`}
                </Text>
              </View>
              <Text style={styles.category}>{app.category}</Text>
              <View style={styles.track}>
                <View
                  style={[
                    styles.bar,
                    {
                      width: `${(app.minutes / PEAK) * 100}%`,
                      backgroundColor: blocked ? colors.mint : TINTS[app.key],
                    },
                  ]}
                />
              </View>
            </View>
          </Pressable>
        );
      })}

      <PanelFoot
        label="Off limits"
        value={formatSpan(total)}
        unit="a day"
        empty={selected.length === 0}
      />
    </Panel>
  );
}

/** The unblocked bar wears the app's own colour; blocking replaces it with mint. */
const TINTS: Record<string, string> = {
  instagram: 'rgba(225, 48, 108, 0.75)',
  youtube: 'rgba(255, 61, 61, 0.75)',
  tiktok: 'rgba(37, 244, 238, 0.7)',
  reddit: 'rgba(255, 122, 60, 0.75)',
  x: 'rgba(242, 244, 243, 0.6)',
  facebook: 'rgba(59, 130, 246, 0.75)',
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm + 4,
    paddingHorizontal: space.md,
  },
  copy: {
    flex: 1,
    gap: 5,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  name: {
    color: colors.text,
    fontFamily: font.display,
    fontSize: 16.5,
    letterSpacing: -0.2,
  },
  nameBlocked: {
    color: colors.muted,
  },
  minutes: {
    color: colors.textDim,
    fontFamily: font.bodySemi,
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
  minutesBlocked: {
    color: colors.mint,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(173, 226, 210, 0.08)',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 2,
  },
  category: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 11.5,
  },
  pressed: {
    opacity: 0.75,
  },
});
