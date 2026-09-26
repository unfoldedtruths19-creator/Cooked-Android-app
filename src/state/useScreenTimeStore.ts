import { create } from 'zustand';
import {
  fetchDailySummaries,
  fetchTodayFocusMinutes,
  fetchStreakDays,
  fetchTodayDistractions,
  deriveTodayStats,
  deriveWeekEntries,
  deriveAppBreakdown,
  type TodayStats,
  type WeekEntry,
  type AppBreakdownEntry,
  type DailySummary,
} from '@/lib/screenTimeData';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

interface ScreenTimeState {
  loadState: LoadState;
  errorMessage: string | null;

  // Raw
  summaries: DailySummary[];

  // Derived — these are what screens read
  todayStats: TodayStats | null;
  weekEntries: WeekEntry[];
  appBreakdown: AppBreakdownEntry[];

  // Actions
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

const EMPTY_TODAY: TodayStats = {
  screenTimeMinutes: 0,
  focusMinutes: 0,
  pickups: 0,
  distractions: 0,
  cookedScore: 0,
  streakDays: 0,
  changeVsYesterday: 0,
  topApp: null,
};

export const useScreenTimeStore = create<ScreenTimeState>((set, get) => ({
  loadState: 'idle',
  errorMessage: null,
  summaries: [],
  todayStats: null,
  weekEntries: [],
  appBreakdown: [],

  load: async () => {
    // Don't re-fetch if already loaded (use refresh() to force)
    if (get().loadState === 'ready') return;
    return get().refresh();
  },

  refresh: async () => {
    set({ loadState: 'loading', errorMessage: null });
    try {
      const [summaries, focusMinutes, streakDays, distractions] = await Promise.all([
        fetchDailySummaries(7),
        fetchTodayFocusMinutes(),
        fetchStreakDays(),
        fetchTodayDistractions(),
      ]);

      const todayStats    = deriveTodayStats(summaries, focusMinutes, streakDays, distractions);
      const weekEntries   = deriveWeekEntries(summaries);
      const appBreakdown  = deriveAppBreakdown(summaries[0] ?? null);

      set({ loadState: 'ready', summaries, todayStats, weekEntries, appBreakdown });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load your stats.';
      set({ loadState: 'error', errorMessage: msg, todayStats: EMPTY_TODAY });
    }
  },
}));
