/**
 * Design tokens for Cooked.
 * Palette is sampled from the brand mark: mint leaf -> aqua tail on deep pine ink.
 * No gradients anywhere — depth comes from one shared background wash plus
 * frosted glass surfaces layered on top of it.
 */
export const colors = {
  ink: '#04100F',
  inkDeep: '#020A0C',

  /** Ambient tints for the shared page background. One stacked disc's worth — keep it tiny. */
  washMint: 'rgba(143, 227, 117, 0.013)',
  washAqua: 'rgba(63, 197, 216, 0.013)',

  /** Glass surfaces: a translucent wash sitting over a blur. */
  glass: 'rgba(255, 255, 255, 0.045)',
  glassRaised: 'rgba(255, 255, 255, 0.07)',
  glassStrong: 'rgba(255, 255, 255, 0.10)',
  glassLine: 'rgba(255, 255, 255, 0.10)',
  glassLineStrong: 'rgba(173, 226, 210, 0.24)',
  glassBar: 'rgba(6, 20, 21, 0.62)',

  /** Accent glass: same recipe, tinted mint. */
  accentGlass: 'rgba(143, 227, 117, 0.14)',
  accentGlassStrong: 'rgba(143, 227, 117, 0.22)',
  accentSoft: 'rgba(143, 227, 117, 0.07)',
  accentLine: 'rgba(143, 227, 117, 0.5)',

  hairline: 'rgba(173, 226, 210, 0.14)',
  hairlineStrong: 'rgba(173, 226, 210, 0.26)',

  mint: '#8FE375',
  spring: '#5CD3A4',
  aqua: '#3FC5D8',
  /** Warm step on the doneness ramp, between mint and danger. */
  ember: '#F0B36C',
  text: '#EAF4F1',
  textDim: '#A9BEBD',
  muted: '#6F8A8C',
  danger: '#F0846C',

  line: 'rgba(173, 226, 210, 0.10)',
  lineStrong: 'rgba(173, 226, 210, 0.2)',
} as const;

/** Blur strength, one scale so every frosted surface reads as the same material. */
export const blur = {
  bar: 26,
  card: 22,
  tile: 16,
} as const;

export const font = {
  display: 'Sora_600SemiBold',
  displayHeavy: 'Sora_800ExtraBold',
  displayBold: 'Sora_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
} as const;

export const radius = {
  field: 18,
  card: 30,
  pill: 999,
} as const;

export const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
} as const;
