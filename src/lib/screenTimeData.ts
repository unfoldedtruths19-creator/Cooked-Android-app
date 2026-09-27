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
  abandonedCount:     number;    // abandoned focus sessions today
  completedCount:     number;    // completed focus sessions today
  cookedScore:        number;    // 0-100
  streakDays:         number;
  journeyDay:         number;
  changeVsYesterday:  number;    // percent, negative = improvement
  topApp: { name: string; minutes: number; opens: number } | null;
}

export interface WeeklyFocusDay {
  date: string;
  dayName: string;
  focusMinutes: number;
  sessionCount: number;
  status: 'upcoming' | 'missed' | 'completed' | 'in_progress';
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

function getLocalMonday(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff, 0, 0, 0, 0);
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
 * Fetch total focus minutes and session counts for today (local time).
 */
export async function fetchTodayFocusStats(): Promise<{ focusMinutes: number; abandonedCount: number; completedCount: number }> {
  const start = localDayStart().toISOString();   // midnight local → ISO
  const end   = localDayEnd().toISOString();     // midnight next day → ISO

  const { data, error } = await supabase
    .from('focus_sessions')
    .select('duration_seconds, status')
    .gte('started_at', start)
    .lt('started_at', end);         // lt end-of-day = correct closed interval

  if (error) return { focusMinutes: 0, abandonedCount: 0, completedCount: 0 };
  
  let totalSeconds = 0;
  let abandonedCount = 0;
  let completedCount = 0;

  for (const s of (data ?? [])) {
    if (s.status === 'completed') {
      totalSeconds += (s.duration_seconds ?? 0);
      completedCount++;
    } else if (s.status === 'abandoned') {
      abandonedCount++;
    }
  }

  return { 
    focusMinutes: Math.round(totalSeconds / 60), 
    abandonedCount, 
    completedCount 
  };
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
    .limit(300);

  if (error || !data?.length) return 0;

  const uniqueDays = new Set(
    data.map((s) => localDateStr(new Date(s.started_at)))
  );

  let streak = 0;
  const cursor = new Date();

  // If they haven't completed a session today, check if they completed one yesterday.
  // If not, their streak is 0.
  if (!uniqueDays.has(localDateStr(cursor))) {
    const yesterday = new Date(cursor);
    yesterday.setDate(yesterday.getDate() - 1);
    if (!uniqueDays.has(localDateStr(yesterday))) {
      return 0;
    }
    // They did it yesterday, so start counting from yesterday
    cursor.setDate(cursor.getDate() - 1);
  }

  while (true) {
    const key = localDateStr(cursor);
    if (uniqueDays.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Fetch the user's Journey Day.
 * Journey Day = (Today's local date) - (Local date of user's sign up / auth.getUser().created_at) + 1
 */
export async function fetchJourneyDay(): Promise<number> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.created_at) return 1;

  const createdAt = new Date(data.user.created_at);
  const today = new Date();
  
  // Calculate difference in local days
  const startDay = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());
  const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  
  const diffTime = Math.abs(currentDay.getTime() - startDay.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
  
  return diffDays + 1;
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

export async function fetchWeeklyFocusStats(weeksAgo = 0): Promise<WeeklyFocusDay[]> {
  const monday = getLocalMonday();
  if (weeksAgo > 0) {
    monday.setDate(monday.getDate() - (weeksAgo * 7));
  }
  const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  const startIso = monday.toISOString();
  const endIso = nextMonday.toISOString();

  const { data, error } = await supabase
    .from('focus_sessions')
    .select('started_at, duration_seconds, status')
    .gte('started_at', startIso)
    .lt('started_at', endIso);
    
  const week: Record<string, WeeklyFocusDay> = {};
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = localDateStr(d);
    week[dateStr] = {
      date: dateStr,
      dayName: DAYS[i],
      focusMinutes: 0,
      sessionCount: 0,
      status: 'upcoming'
    };
  }
  
  if (!error && data) {
    for (const session of data) {
      if (session.status !== 'completed') continue;
      const d = new Date(session.started_at);
      const dateStr = localDateStr(d);
      if (week[dateStr]) {
        week[dateStr].focusMinutes += Math.round((session.duration_seconds ?? 0) / 60);
        week[dateStr].sessionCount += 1;
      }
    }
  }

  const todayStr = localDateStr();
  let pastToday = false;
  // Hardcoded default daily goal, should ideally come from user profile, but using 60m as default
  const dailyGoal = 60; 

  const result = Object.values(week).map(day => {
    if (day.date === todayStr) {
      pastToday = true;
      if (day.focusMinutes >= dailyGoal) day.status = 'completed';
      else if (day.focusMinutes > 0) day.status = 'in_progress';
      else day.status = 'upcoming'; 
    } else if (!pastToday) {
      if (day.focusMinutes >= dailyGoal) day.status = 'completed';
      else day.status = 'missed';
    } else {
      day.status = 'upcoming';
    }
    return day;
  });
  
  return result;
}

// ─── Derived stats ────────────────────────────────────────────────────────────

export function deriveTodayStats(
  summaries:       DailySummary[],
  focusStats:      { focusMinutes: number; abandonedCount: number; completedCount: number },
  streakDays:      number,
  blockedAttempts: number,
  journeyDay:      number,
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
    focusMinutes:      focusStats.focusMinutes,
    pickups:           today?.session_count ?? 0,
    distractions:      blockedAttempts,
    abandonedCount:    focusStats.abandonedCount,
    completedCount:    focusStats.completedCount,
    cookedScore,
    streakDays,
    journeyDay,
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
