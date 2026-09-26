import type { BrandKey } from '@/components/app/brand-icon';
import { colors } from '@/theme/tokens';

/** `3h` reads better than `3h 0m` on the summary lines. */
export function formatSpan(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export type LevelKey = 'lightly-toasted' | 'medium' | 'well-done' | 'cremated';

/**
 * The doneness ramp. Colour runs cool to hot, `factor` scales what step 2 says
 * you can win back, and `dailyMinutes` is the screen time the pick implies.
 */
export const LEVELS: readonly {
  key: LevelKey;
  title: string;
  note: string;
  band: string;
  dailyMinutes: number;
  factor: number;
  color: string;
}[] = [
  {
    key: 'lightly-toasted',
    title: 'Lightly toasted',
    note: 'Mostly in control',
    band: 'under 2h',
    dailyMinutes: 100,
    factor: 0.6,
    color: colors.spring,
  },
  {
    key: 'medium',
    title: 'Medium',
    note: 'The evenings disappear',
    band: '2–4h',
    dailyMinutes: 180,
    factor: 1,
    color: colors.mint,
  },
  {
    key: 'well-done',
    title: 'Well done',
    note: 'First and last thing I touch',
    band: '4–6h',
    dailyMinutes: 300,
    factor: 1.5,
    color: colors.ember,
  },
  {
    key: 'cremated',
    title: 'Cremated',
    note: 'I already know. Do not say it.',
    band: '6h+',
    dailyMinutes: 420,
    factor: 2,
    color: colors.danger,
  },
];

export function levelFor(key?: string) {
  return LEVELS.find((level) => level.key === key) ?? LEVELS[1];
}

export type Goal = {
  key: string;
  title: string;
  note: string;
  /** Minutes per week this goal buys back at a medium pace. */
  minutes: number;
};

const GOALS: readonly Goal[] = [
  { key: 'doomscrolling', title: 'Evenings', note: 'Back from the endless feed', minutes: 310 },
  { key: 'focus', title: 'Deep work', note: 'Blocks nothing interrupts', minutes: 220 },
  { key: 'study', title: 'Study time', note: 'One subject, no switching', minutes: 165 },
  { key: 'sleep', title: 'Sleep', note: 'Phone down before midnight', minutes: 140 },
];

/** Step 1's answer sets how much there is to win back in step 2. */
export function goalsFor(levelKey?: string): Goal[] {
  const { factor } = levelFor(levelKey);
  return GOALS.map((goal) => ({
    ...goal,
    minutes: Math.round((goal.minutes * factor) / 5) * 5,
  }));
}

export function weeklyReclaim(levelKey: string | undefined, goalKeys: string[]) {
  return goalsFor(levelKey)
    .filter((goal) => goalKeys.includes(goal.key))
    .reduce((sum, goal) => sum + goal.minutes, 0);
}

export function goalTitle(key: string) {
  return GOALS.find((goal) => goal.key === key)?.title ?? key;
}

export const APPS: readonly { key: BrandKey; name: string; category: string; minutes: number }[] = [
  { key: 'instagram', name: 'Instagram', category: 'Social', minutes: 52 },
  { key: 'youtube', name: 'YouTube', category: 'Video', minutes: 44 },
  { key: 'tiktok', name: 'TikTok', category: 'Short video', minutes: 41 },
  { key: 'reddit', name: 'Reddit', category: 'Feeds', minutes: 38 },
  { key: 'x', name: 'X', category: 'News', minutes: 30 },
  { key: 'facebook', name: 'Facebook', category: 'Social', minutes: 18 },
];
