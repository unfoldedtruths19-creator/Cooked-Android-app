import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme/tokens';

export type BrandKey = 'instagram' | 'youtube' | 'reddit' | 'x' | 'facebook' | 'tiktok' | 'snapchat';

type Brand = { tint: string; tile: string; border: string; glyph: (color: string) => React.ReactNode };

/** Simplified brand marks drawn inline: no network fetch, no logo assets to ship. */
const BRANDS: Record<BrandKey, Brand> = {
  instagram: {
    tint: '#E1306C',
    tile: 'rgba(225, 48, 108, 0.14)',
    border: 'rgba(225, 48, 108, 0.35)',
    glyph: (color) => (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Rect x={3} y={3} width={18} height={18} rx={5} stroke={color} strokeWidth={1.8} />
        <Circle cx={12} cy={12} r={4.2} stroke={color} strokeWidth={1.8} />
        <Circle cx={17.2} cy={6.8} r={1.2} fill={color} />
      </Svg>
    ),
  },
  youtube: {
    tint: '#FF3D3D',
    tile: 'rgba(255, 61, 61, 0.14)',
    border: 'rgba(255, 61, 61, 0.32)',
    glyph: (color) => (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Rect x={2.5} y={5.5} width={19} height={13} rx={4} stroke={color} strokeWidth={1.8} />
        <Path d="M10.4 9.4 15.2 12l-4.8 2.6V9.4Z" fill={color} />
      </Svg>
    ),
  },
  reddit: {
    tint: '#FF7A3C',
    tile: 'rgba(255, 122, 60, 0.14)',
    border: 'rgba(255, 122, 60, 0.32)',
    glyph: (color) => (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
        <Circle cx={9} cy={11} r={1.15} fill={color} />
        <Circle cx={15} cy={11} r={1.15} fill={color} />
        <Path d="M8.6 15c.9.9 2 1.35 3.4 1.35S14.5 15.9 15.4 15" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    ),
  },
  x: {
    tint: '#F2F4F3',
    tile: 'rgba(242, 244, 243, 0.09)',
    border: 'rgba(242, 244, 243, 0.2)',
    glyph: (color) => (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path d="M4 4h3.6l5 6.6L18 4h2l-6.4 8.2L20.5 20h-3.6l-5.3-7L5.6 20H3.5l6.9-8.6L4 4Z" fill={color} />
      </Svg>
    ),
  },
  facebook: {
    tint: '#3B82F6',
    tile: 'rgba(59, 130, 246, 0.14)',
    border: 'rgba(59, 130, 246, 0.32)',
    glyph: (color) => (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M14.6 21v-7.4h2.5l.4-2.9h-2.9V8.9c0-.85.24-1.42 1.45-1.42h1.55V4.9c-.27-.04-1.2-.12-2.27-.12-2.25 0-3.79 1.37-3.79 3.9v2.02H9v2.9h2.54V21h3.06Z"
          fill={color}
        />
      </Svg>
    ),
  },
  tiktok: {
    tint: '#25F4EE',
    tile: 'rgba(37, 244, 238, 0.12)',
    border: 'rgba(37, 244, 238, 0.28)',
    glyph: (color) => (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M14 3.2h2.5c.25 1.9 1.4 3.2 3.3 3.5v2.6c-1.3-.05-2.4-.45-3.3-1.15v5.6c0 3.1-2.2 5.05-5 5.05a4.9 4.9 0 0 1 0-9.8c.28 0 .55.02.8.07v2.7a2.3 2.3 0 1 0 1.7 2.2V3.2Z"
          fill={color}
        />
      </Svg>
    ),
  },
  snapchat: {
    tint: '#F5D90A',
    tile: 'rgba(245, 217, 10, 0.12)',
    border: 'rgba(245, 217, 10, 0.28)',
    glyph: (color) => (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 3.4c2.6 0 4.2 1.9 4.2 4.6 0 .9-.1 1.7-.1 1.7.5.25 1.2.1 1.6 0 .5-.1.9.5.5.95-.5.55-1.6.85-1.6 1.35 0 .9 2.4 2.6 3.3 2.9.4.15.3.7-.1.85-.8.3-1.7.3-1.9.7-.15.35.05.9-.45 1-.6.1-1.6-.3-2.6.1-.85.35-1.5 1.35-2.85 1.35s-2-1-2.85-1.35c-1-.4-2 0-2.6-.1-.5-.1-.3-.65-.45-1-.2-.4-1.1-.4-1.9-.7-.4-.15-.5-.7-.1-.85.9-.3 3.3-2 3.3-2.9 0-.5-1.1-.8-1.6-1.35-.4-.45 0-1.05.5-.95.4.1 1.1.25 1.6 0 0 0-.1-.8-.1-1.7 0-2.7 1.6-4.6 4.2-4.6Z"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </Svg>
    ),
  },
};

/** `drained` strips the brand colour out — used to show an app has been blocked. */
export function BrandIcon({
  brand,
  size = 46,
  drained,
}: {
  brand: BrandKey;
  size?: number;
  drained?: boolean;
}) {
  const config = BRANDS[brand];
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: size / 3.4,
          backgroundColor: drained ? colors.glass : config.tile,
          borderColor: drained ? colors.glassLine : config.border,
        },
      ]}
    >
      {config.glyph(drained ? colors.muted : config.tint)}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderCurve: 'continuous',
  },
});
