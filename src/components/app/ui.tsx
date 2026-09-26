import { BlurView } from 'expo-blur';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBackground } from '@/components/app/app-background';
import { blur, colors, font, radius, space } from '@/theme/tokens';

export function Screen({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <AppBackground />
      <View
        style={[
          styles.body,
          { paddingTop: insets.top + space.md },
          padded && styles.screenPadded,
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

/**
 * The one frosted surface. Everything that used to be a solid card is this:
 * a dark blur of the page background, a thin translucent wash, a hairline edge.
 */
export function Glass({
  children,
  style,
  intensity = blur.card,
  raised,
}: {
  children?: ReactNode;
  style?: ViewStyle | ViewStyle[];
  intensity?: number;
  raised?: boolean;
}) {
  return (
    <View style={[styles.glass, raised && styles.glassRaised, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <Glass style={[styles.card, style as ViewStyle]}>
      <View style={styles.cardInner}>{children}</View>
    </Glass>
  );
}

/** One number, one label. Used in rows of three on Today and Insights. */
export function StatTile({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <Glass intensity={blur.tile} style={styles.tile}>
      <View style={styles.tileInner}>
        <Text style={[styles.tileValue, accent && styles.tileValueAccent]}>{value}</Text>
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
    </Glass>
  );
}

/** Horizontal meter. `tone` picks mint for good, dim for merely factual. */
export function Meter({ percent, tone = 'brand' }: { percent: number; tone?: 'brand' | 'dim' }) {
  return (
    <View style={styles.meterTrack}>
      <View
        style={[
          styles.meterFill,
          tone === 'brand' ? styles.meterBrand : styles.meterDim,
          { width: `${Math.max(2, Math.min(100, percent))}%` },
        ]}
      />
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: SymbolViewProps['name'];
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, style, pressed && styles.pressed]}
    >
      <Text style={styles.primaryLabel}>{label}</Text>
      {icon ? <SymbolView name={icon} tintColor={colors.ink} size={18} weight="semibold" /> : null}
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  danger,
  style,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.ghost, danger && styles.ghostDanger, style, pressed && styles.pressed]}
    >
      <BlurView intensity={blur.tile} tint="dark" style={StyleSheet.absoluteFill} />
      <Text style={[styles.ghostLabel, danger && styles.ghostLabelDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  body: {
    flex: 1,
  },
  screenPadded: {
    paddingHorizontal: space.lg,
  },
  eyebrow: {
    color: colors.muted,
    fontFamily: font.bodyMedium,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  glass: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassLine,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  glassRaised: {
    backgroundColor: colors.glassRaised,
  },
  card: {
    borderRadius: radius.card - 6,
  },
  cardInner: {
    padding: space.md,
  },
  tile: {
    flex: 1,
    borderRadius: radius.field,
  },
  tileInner: {
    paddingVertical: space.md,
    paddingHorizontal: space.sm + 2,
    gap: 4,
  },
  tileValue: {
    color: colors.text,
    fontFamily: font.display,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  tileValueAccent: {
    color: colors.mint,
  },
  tileLabel: {
    color: colors.muted,
    fontFamily: font.body,
    fontSize: 11.5,
  },
  meterTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(173, 226, 210, 0.10)',
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 4,
  },
  meterBrand: {
    backgroundColor: colors.mint,
  },
  meterDim: {
    backgroundColor: 'rgba(173, 226, 210, 0.35)',
  },
  primary: {
    height: 60,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.mint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    boxShadow: '0 10px 28px rgba(143, 227, 117, 0.22)',
  },
  primaryLabel: {
    color: colors.ink,
    fontFamily: font.displayHeavy,
    fontSize: 16,
    letterSpacing: 1.2,
  },
  ghost: {
    height: 52,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.glassLine,
    backgroundColor: colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    overflow: 'hidden',
  },
  ghostDanger: {
    borderColor: 'rgba(240, 132, 108, 0.45)',
  },
  ghostLabel: {
    color: colors.text,
    fontFamily: font.bodySemi,
    fontSize: 14,
    letterSpacing: 0.6,
  },
  ghostLabelDanger: {
    color: colors.danger,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
});
