import { BlurTargetView } from 'expo-blur';
import type { RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

/** Stacked discs, each barely over 1% alpha, fake a soft falloff without a gradient. */
const HALO_STEPS = [1, 0.86, 0.72, 0.58, 0.44, 0.3] as const;

function Halo({
  size,
  tint,
  style,
}: {
  size: number;
  tint: string;
  style: { top?: number; bottom?: number; left?: number; right?: number };
}) {
  return (
    <View style={[styles.halo, style, { width: size, height: size }]}>
      {HALO_STEPS.map((scale) => {
        const disc = size * scale;
        return (
          <View
            key={scale}
            style={{
              position: 'absolute',
              top: (size - disc) / 2,
              left: (size - disc) / 2,
              width: disc,
              height: disc,
              borderRadius: disc / 2,
              backgroundColor: tint,
            }}
          />
        );
      })}
    </View>
  );
}

/**
 * The one background every screen sits on: deep ink plus two near-invisible
 * ambient halos. Identical on auth, onboarding and the tabs, so moving between
 * them never changes the ground. It doubles as the blur target, which is what
 * gives the glass surfaces above it something to frost.
 */
export function AppBackground({ blurRef }: { blurRef?: RefObject<View | null> }) {
  return (
    <BlurTargetView ref={blurRef} style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.base} />
      <Halo size={720} tint={colors.washMint} style={{ top: -300, left: -280 }} />
      <Halo size={800} tint={colors.washAqua} style={{ bottom: -360, right: -300 }} />
    </BlurTargetView>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.ink,
  },
  halo: {
    position: 'absolute',
  },
});
