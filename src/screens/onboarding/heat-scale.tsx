import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Panel, PanelFoot, row } from './panel';
import { LEVELS, formatSpan, levelFor, type LevelKey } from './plan-data';
import { colors, font, space } from '@/theme/tokens';

/**
 * Doneness is a scale, so it is drawn as one: a ladder that fills from the top
 * down to whatever you admit to. Everything at or below your pick is lit in that
 * level's heat colour, so the answer reads before you get to the labels.
 */
function Rung({
  filled,
  isSelected,
  color,
  first,
  last,
}: {
  filled: boolean;
  isSelected: boolean;
  color: string;
  first: boolean;
  last: boolean;
}) {
  const lit = filled ? color : colors.glassLine;
  const above = first ? 'transparent' : lit;
  const below = last ? 'transparent' : filled && !isSelected ? color : colors.glassLine;

  return (
    <View style={styles.ladder}>
      <View style={[styles.track, { backgroundColor: above }]} />
      <View
        style={[
          styles.dot,
          { borderColor: lit },
          filled && { backgroundColor: color },
          isSelected && styles.dotSelected,
        ]}
      />
      <View style={[styles.track, { backgroundColor: below }]} />
    </View>
  );
}

export function HeatScale({
  selected,
  onSelect,
}: {
  selected: LevelKey | null;
  onSelect: (key: LevelKey) => void;
}) {
  const index = LEVELS.findIndex((level) => level.key === selected);
  const level = levelFor(selected ?? undefined);

  return (
    <Panel unit="A DAY">
      {LEVELS.map((item, position) => {
        const filled = index >= 0 && position <= index;
        const isSelected = position === index;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${item.title}, ${item.band} a day`}
            onPress={() => onSelect(item.key)}
            style={({ pressed }) => [
              styles.row,
              position > 0 && row.divided,
              pressed && styles.pressed,
            ]}
          >
            <Rung
              filled={filled}
              isSelected={isSelected}
              color={item.color}
              first={position === 0}
              last={position === LEVELS.length - 1}
            />
            <View style={styles.copy}>
              <Text style={[styles.title, isSelected && { color: item.color }]}>{item.title}</Text>
              <Text style={styles.note}>{item.note}</Text>
            </View>
            <Text style={[styles.band, isSelected && { color: item.color }]}>{item.band}</Text>
          </Pressable>
        );
      })}

      <PanelFoot
        label="That's about"
        value={formatSpan(level.dailyMinutes * 7)}
        unit="a week"
        color={level.color}
        empty={index < 0}
      />
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingVertical: space.md - 2,
    paddingLeft: space.md - 4,
    paddingRight: space.md,
  },
  ladder: {
    width: 14,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginVertical: -(space.md - 2),
  },
  track: {
    flex: 1,
    width: 2,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    marginVertical: 3,
  },
  dotSelected: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    marginVertical: 0,
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
  note: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 12.5,
    lineHeight: 17,
  },
  band: {
    color: colors.muted,
    fontFamily: font.display,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: 0.75,
  },
});
