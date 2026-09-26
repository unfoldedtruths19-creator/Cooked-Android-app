import { StyleSheet, Text, View } from 'react-native';

import { Panel, PanelFoot, row } from './panel';
import { formatSpan, goalTitle, levelFor } from './plan-data';
import { BrandIcon, type BrandKey } from '@/components/app/brand-icon';
import { colors, font, radius, space } from '@/theme/tokens';

/**
 * The payoff screen is an itinerary, not a summary of form answers: when things
 * happen, then what happens. The foot carries the number step 2 promised, so the
 * flow closes on the same currency it opened with.
 */
export function PlanCard({
  level,
  goalKeys,
  appKeys,
  reclaimMinutes,
}: {
  level?: string;
  goalKeys: string[];
  appKeys: BrandKey[];
  reclaimMinutes: number;
}) {
  const heat = levelFor(level);

  return (
    <Panel unit="DAY ONE">
      <View style={styles.row}>
        <Text style={styles.when}>ALL DAY</Text>
        <View style={styles.what}>
          <Text style={styles.title}>Blocked</Text>
          {appKeys.length > 0 ? (
            <View style={styles.apps}>
              {appKeys.map((key) => (
                <BrandIcon key={key} brand={key} size={34} drained />
              ))}
            </View>
          ) : (
            <Text style={styles.note}>Nothing yet — add apps any time</Text>
          )}
        </View>
      </View>

      <View style={[styles.row, row.divided]}>
        <Text style={styles.when}>50 MIN</Text>
        <View style={styles.what}>
          <Text style={styles.title}>First focus session</Text>
          <View style={styles.chips}>
            {goalKeys.map((key) => (
              <View key={key} style={styles.chip}>
                <Text style={styles.chipText}>{goalTitle(key)}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={[styles.row, row.divided]}>
        <Text style={styles.when}>9:00 PM</Text>
        <View style={styles.what}>
          <Text style={styles.title}>The roast</Text>
          <Text style={styles.note}>Your day, read back to you. Once.</Text>
        </View>
      </View>

      <View style={[styles.row, row.divided]}>
        <Text style={styles.when}>FROM</Text>
        <View style={styles.what}>
          <Text style={[styles.title, { color: heat.color }]}>{heat.title}</Text>
          <Text style={styles.note}>Where you said you are starting</Text>
        </View>
      </View>

      <PanelFoot
        label="Playing for"
        value={formatSpan(reclaimMinutes)}
        unit="a week"
        empty={reclaimMinutes === 0}
      />
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: space.md - 2,
    paddingHorizontal: space.md,
  },
  when: {
    width: 62,
    paddingTop: 2,
    color: colors.muted,
    fontFamily: font.bodyMedium,
    fontSize: 10.5,
    letterSpacing: 1.2,
    fontVariant: ['tabular-nums'],
  },
  what: {
    flex: 1,
    gap: space.xs + 2,
  },
  title: {
    color: colors.text,
    fontFamily: font.display,
    fontSize: 16.5,
    letterSpacing: -0.2,
  },
  note: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 12.5,
    lineHeight: 18,
  },
  apps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accentLine,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  chipText: {
    color: colors.mint,
    fontFamily: font.bodySemi,
    fontSize: 12,
  },
});
