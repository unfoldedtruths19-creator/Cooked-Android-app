import { create } from 'zustand';
import {
  fetchDailySummaries,
  fetchTodayFocusStats,
  fetchStreakDays,
  fetchTodayDistractions,
  fetchJourneyDay,
  deriveTodayStats,
  deriveWeekEntries,
  deriveAppBreakdown,
  fetchWeeklyFocusStats,
  type TodayStats,
  type WeekEntry,
  type AppBreakdownEntry,
  type DailySummary,
  type WeeklyFocusDay,
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
  weeklyFocus: WeeklyFocusDay[];
  previousWeeklyFocus: WeeklyFocusDay[];
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
  abandonedCount: 0,
  completedCount: 0,
  cookedScore: 0,
  streakDays: 0,
  journeyDay: 1,
  changeVsYesterday: 0,
  topApp: null,
};

export const useScreenTimeStore = create<ScreenTimeState>((set, get) => ({
  loadState: 'idle',
  errorMessage: null,
  summaries: [],
  todayStats: null,
  weekEntries: [],
  weeklyFocus: [],
  previousWeeklyFocus: [],
  appBreakdown: [],

  load: async () => {
    // Don't re-fetch if already loaded (use refresh() to force)
    if (get().loadState === 'ready') return;
    return get().refresh();
  },

  refresh: async () => {
    set({ loadState: 'loading', errorMessage: null });
    try {
      const [summaries, focusStats, streakDays, distractions, journeyDay, weeklyFocus, previousWeeklyFocus] = await Promise.all([
        fetchDailySummaries(7),
        fetchTodayFocusStats(),
        fetchStreakDays(),
        fetchTodayDistractions(),
        fetchJourneyDay(),
        fetchWeeklyFocusStats(0),
        fetchWeeklyFocusStats(1),
      ]);

      const todayStats    = deriveTodayStats(summaries, focusStats, streakDays, distractions, journeyDay);
      const weekEntries   = deriveWeekEntries(summaries);
      const appBreakdown  = deriveAppBreakdown(summaries[0] ?? null);

      set({ loadState: 'ready', summaries, todayStats, weekEntries, weeklyFocus, previousWeeklyFocus, appBreakdown });
    } catch (e) {
      console.error('Failed to load screen time stats:', e);
      const msg = e instanceof Error ? e.message : 'Failed to load your stats.';
      set({ loadState: 'error', errorMessage: msg, todayStats: EMPTY_TODAY });
    }
  },
}));
