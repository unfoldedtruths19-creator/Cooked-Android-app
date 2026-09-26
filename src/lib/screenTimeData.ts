import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailySummary {
  summary_date:   string;                      // 'YYYY-MM-DD'
  total_seconds:  number;
  top_app_name:   string | null;
  top_app_seconds: number;
  app_breakdown:  Record<string, number>;      // { "Instagram": 3600, ... }
  session_count:  number;
}

export interface TodayStats {
  screenTimeMinutes:  number;
  focusMinutes:       number;
  pickups:            number;    // session_count for today
  distractions:       number;    // blocked attempts during focus
  cookedScore:        number;    // 0-100
  streakDays:         number;
  changeVsYesterday:  number;    // percent, negative = improvement
  topApp: { name: string; minutes: number; opens: number } | null;
}

export interface WeekEntry {
  day:           string;
  attention:     number;   // 100 - cookedScore
  screenMinutes: number;
}

export interface AppBreakdownEntry {
  name:    string;
  minutes: number;
  opens:   number;
}

// ─── Timezone-safe date helpers ───────────────────────────────────────────────
// toISOString() returns UTC — for a user in IST (UTC+5:30) at 11pm,
// that's the NEXT day in UTC, which breaks streaks and today's data.
// These helpers use the device's local timezone throughout.

function localDateStr(date = new Date()): string {
  // 'YYYY-MM-DD' in device local time
  const y  = date.getFullYear();
  const m  = String(date.getMonth() + 1).padStart(2, '0');
  const d  = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function localDayStart(date = new Date()): Date {
  // Midnight local time on the given date
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function localDayEnd(date = new Date()): Date {
  // 1ms before midnight next day (end of current day, local time)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

/**
 * Fetch last N days of daily_summaries for the signed-in user.
 * Filters by date range so gaps in history don't displace results.
 * Returns newest-first.
 */
export async function fetchDailySummaries(days = 7): Promise<DailySummary[]> {
  // Oldest date we care about, in local time
  const from = localDateStr(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));
  const to   = localDateStr();                // today local

  const { data, error } = await supabase
    .from('daily_summaries')
    .select('summary_date, total_seconds, top_app_name, top_app_seconds, app_breakdown, session_count')
    .gte('summary_date', from)
    .lte('summary_date', to)
    .order('summary_date', { ascending: false })
    .limit(days);

  if (error) throw new Error(error.message);
  return (data ?? []) as DailySummary[];
}

/**
 * Fetch total focus minutes completed today (local time).
 */
export async function fetchTodayFocusMinutes(): Promise<number> {
  const start = localDayStart().toISOString();   // midnight local → ISO
  const end   = localDayEnd().toISOString();     // midnight next day → ISO

  const { data, error } = await supabase
    .from('focus_sessions')
    .select('duration_seconds')
    .eq('status', 'completed')
    .gte('started_at', start)
    .lt('started_at', end);         // lt end-of-day = correct closed interval

  if (error) return 0;
  const total = (data ?? []).reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  return Math.round(total / 60);
}

/**
 * Count consecutive days with at least one completed focus session.
 * Uses local dates so IST / any timezone users get the right streak.
 */
export async function fetchStreakDays(): Promise<number> {
  const { data, error } = await supabase
    .from('focus_sessions')
    .select('started_at')
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(90);  // 90 sessions = safe upper bound for a 60-day streak check

  if (error || !data?.length) return 0;

  // Convert each timestamp to local 'YYYY-MM-DD'
  const uniqueDays = new Set(
    data.map((s) => {
      const d = new Date(s.started_at);
      return localDateStr(d);
    })
  );

  let streak = 0;
  const cursor = new Date();   // today in local time

  while (true) {
    const key = localDateStr(cursor);
    if (uniqueDays.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);   // go back one local day
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Sum blocked-app attempt counts across all of today's focus sessions
 * (local day) — feeds the Today screen's "Distractions" tile, which
 * previously always showed 0 because attempt counts were never persisted.
 */
export async function fetchTodayDistractions(): Promise<number> {
  const start = localDayStart().toISOString();
  const end   = localDayEnd().toISOString();

  const { data, error } = await supabase
    .from('focus_sessions')
    .select('attempt_count')
    .gte('started_at', start)
    .lt('started_at', end);

  if (error) return 0;
  return (data ?? []).reduce((sum, s) => sum + (s.attempt_count ?? 0), 0);
}

// ─── Derived stats ────────────────────────────────────────────────────────────

export function deriveTodayStats(
  summaries:       DailySummary[],
  focusMinutes:    number,
  streakDays:      number,
  blockedAttempts: number,
): TodayStats {
  const todayStr   = localDateStr();
  // summaries is newest-first; find today's and yesterday's explicitly
  const today      = summaries.find((s) => s.summary_date === todayStr) ?? null;
  const yesterday  = summaries.find((s) => {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return s.summary_date === localDateStr(d);
  }) ?? null;

  const screenTimeMinutes = today   ? Math.round(today.total_seconds / 60)     : 0;
  const yesterdayMinutes  = yesterday ? Math.round(yesterday.total_seconds / 60) : 0;

  // Cooked score: 6h daily = 100% cooked ceiling
  const cookedScore = Math.min(100, Math.round((screenTimeMinutes / 360) * 100));

  let changeVsYesterday = 0;
  if (yesterdayMinutes > 0) {
    changeVsYesterday = Math.round(
      ((screenTimeMinutes - yesterdayMinutes) / yesterdayMinutes) * 100
    );
  }

  const topApp = today?.top_app_name
    ? {
        name:    today.top_app_name,
        minutes: Math.round((today.top_app_seconds ?? 0) / 60),
        opens:   today.total_seconds > 0
          ? Math.round((today.top_app_seconds / today.total_seconds) * today.session_count)
          : 0,
      }
    : null;

  return {
    screenTimeMinutes,
    focusMinutes,
    pickups:           today?.session_count ?? 0,
    distractions:      blockedAttempts,
    cookedScore,
    streakDays,
    changeVsYesterday,
    topApp,
  };
}

export function deriveWeekEntries(summaries: DailySummary[]): WeekEntry[] {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return [...summaries].reverse().map((s) => {
    // Parse date as local midnight to get the correct day-of-week
    const [year, month, day] = s.summary_date.split('-').map(Number);
    const dayIdx      = new Date(year, month - 1, day).getDay();
    const screenMinutes = Math.round(s.total_seconds / 60);
    const cookedScore   = Math.min(100, Math.round((screenMinutes / 360) * 100));
    return {
      day:          DAYS[dayIdx],
      attention:    Math.max(0, 100 - cookedScore),
      screenMinutes,
    };
  });
}

export function deriveAppBreakdown(summary: DailySummary | null): AppBreakdownEntry[] {
  if (!summary) return [];
  const breakdown = summary.app_breakdown ?? {};
  const total     = summary.total_seconds;
  const count     = summary.session_count;

  return Object.entries(breakdown)
    .map(([name, seconds]) => ({
      name,
      minutes: Math.round(seconds / 60),
      opens:   total > 0 ? Math.round((seconds / total) * count) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);
}
