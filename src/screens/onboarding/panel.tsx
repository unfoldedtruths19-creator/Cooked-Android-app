import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { blur, colors, font, radius, space } from '@/theme/tokens';

/**
 * Every onboarding question is the same object: one glass panel, hairline rows,
 * and a foot that states what the answer costs or buys. Only the rows differ.
 */
export function Panel({ children, unit }: { children: ReactNode; unit?: string }) {
  return (
    <View style={styles.panel}>
      <BlurView intensity={blur.card} tint="dark" style={StyleSheet.absoluteFill} />
      {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      {children}
    </View>
  );
}

export function PanelFoot({
  label,
  value,
  unit,
  color = colors.mint,
  empty,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  empty?: boolean;
}) {
  return (
    <View style={styles.foot}>
      <Text style={styles.footLabel}>{label}</Text>
      <View style={styles.footValueRow}>
        <Text style={[styles.footValue, empty ? styles.footEmpty : { color }]}>
          {empty ? '—' : value}
        </Text>
        {unit && !empty ? <Text style={styles.footUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

export const row = StyleSheet.create({
  divided: {
    borderTopWidth: 1,
    borderTopColor: colors.glassLine,
  },
});

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.card - 6,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.glassLine,
    backgroundColor: colors.glass,
    overflow: 'hidden',
  },
  unit: {
    color: colors.muted,
    fontFamily: font.bodyMedium,
    fontSize: 10,
    letterSpacing: 1.8,
    textAlign: 'right',
    paddingHorizontal: space.md,
    paddingTop: space.sm + 2,
    paddingBottom: space.xs,
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairlineStrong,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  footValueRow: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  footUnit: {
    color: colors.muted,
    fontFamily: font.bodyMedium,
    fontSize: 12.5,
  },
  footLabel: {
    color: colors.textDim,
    fontFamily: font.bodyMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  footValue: {
    fontFamily: font.displayHeavy,
    fontSize: 28,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  footEmpty: {
    color: colors.muted,
    fontSize: 24,
  },
});
