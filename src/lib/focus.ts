import { supabase } from './supabase';

export type FocusSessionStatus = 'active' | 'interrupted' | 'completed' | 'ended_early' | 'cancelled';

export interface FocusSession {
  id: string;
  user_id: string;
  started_at: string;
  ends_at: string;
  ended_at: string | null;
  duration_seconds: number;
  planned_duration_seconds: number;
  elapsed_seconds: number;
  remaining_seconds: number;
  status: FocusSessionStatus;
  is_paused: boolean;
  paused_seconds: number;
  task: string | null;
  interruption_count: number;
  attempt_count: number;
  blocked_apps: string[];
  allow_browser: boolean;
  xp_awarded: number;
  already_active?: boolean; // only present on start_focus_session's response
}

export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * The DB is the source of truth for the focus session lifecycle (see
 * supabase/migrations/20260924120000_repair_schema_and_focus_lifecycle.sql).
 * Every transition below is a single RPC call — never a direct insert/update
 * on focus_sessions, which the client no longer has write access to.
 *
 * Each function returns { session, error }. `session` is null only on error;
 * a "no active session" result from getActiveFocusSession is a *successful*
 * null, not an error — callers must check `error` to tell those apart.
 */

function unwrap(data: unknown, error: unknown): { session: FocusSession | null; error: Error | null } {
  if (error) return { session: null, error: error as Error };
  return { session: (data as FocusSession | null) ?? null, error: null };
}

export async function startFocusSession(args: {
  id: string;
  task: string;
  plannedSeconds: number;
  blockedApps: string[];
  allowBrowser: boolean;
}) {
  const { data, error } = await supabase.rpc('start_focus_session', {
    p_id: args.id,
    p_task: args.task,
    p_planned_seconds: args.plannedSeconds,
    p_blocked_apps: args.blockedApps,
    p_allow_browser: args.allowBrowser,
  });
  return unwrap(data, error);
}

/** Null session (with no error) means: no open session — go Home, not Focus. */
export async function getActiveFocusSession() {
  const { data, error } = await supabase.rpc('get_active_focus_session');
  return unwrap(data, error);
}

export async function interruptFocusSession(id: string, attemptCount?: number) {
  const { data, error } = await supabase.rpc('interrupt_focus_session', {
    p_id: id,
    p_attempt_count: attemptCount ?? null,
  });
  return unwrap(data, error);
}

export async function continueFocusSession(id: string) {
  const { data, error } = await supabase.rpc('continue_focus_session', { p_id: id });
  return unwrap(data, error);
}

export async function abandonFocusSession(id: string, attemptCount?: number) {
  const { data, error } = await supabase.rpc('abandon_focus_session', {
    p_id: id,
    p_attempt_count: attemptCount ?? null,
  });
  return unwrap(data, error);
}

/** Server rejects this until wall-clock time has actually reached the planned duration. */
export async function completeFocusSession(id: string, attemptCount?: number) {
  const { data, error } = await supabase.rpc('complete_focus_session', {
    p_id: id,
    p_attempt_count: attemptCount ?? null,
  });
  return unwrap(data, error);
}

export async function pauseFocusSession(id: string) {
  const { data, error } = await supabase.rpc('pause_focus_session', { p_id: id });
  return unwrap(data, error);
}

export async function resumeFocusSession(id: string) {
  const { data, error } = await supabase.rpc('resume_focus_session', { p_id: id });
  return unwrap(data, error);
}

/** Fire-and-forget: keeps the native blocked-attempt counter mirrored in the DB
 * while a session runs, so a kill/reopen can recover it. Errors are non-fatal. */
export async function syncFocusAttempts(id: string, attemptCount: number) {
  await supabase.rpc('sync_focus_attempts', { p_id: id, p_attempt_count: attemptCount });
}
