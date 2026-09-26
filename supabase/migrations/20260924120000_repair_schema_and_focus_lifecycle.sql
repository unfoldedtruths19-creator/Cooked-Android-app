-- ============================================================================
-- COOKED — repair screen-time schema + DB-authoritative focus session lifecycle
--
-- Written against the REAL remote state (history: 0001, 0002, 0003, 20260821)
-- and validated on a scratch replica of it. Forward-only, transactional,
-- no data is deleted. If any statement fails the whole migration rolls back.
--
-- PART A  screen-time repair
--   Root cause of the sync 500: 0003 installed fn_update_daily_summary() that
--   writes daily_summaries.summary_date, but the remote column is log_date.
--   Every INSERT into screen_time_logs therefore failed inside the trigger.
--   (0001's original trigger also had a bug: outer SUM(duration_seconds) over a
--   subquery that does not expose that column.)
--
-- PART B  focus sessions
--   State machine (stored in focus_sessions.status):
--     active -> interrupted -> active            (continue)
--     active|interrupted -> completed            (duration reached)
--     active|interrupted -> cancelled            (abandoned; row is kept)
--   'ended_early' stays a legal legacy value but is never written any more.
-- ============================================================================


-- ############################################################################
-- PART A — screen-time repair
-- ############################################################################

-- A1. daily_summaries.log_date -> summary_date.
--     Prod has 0 rows in this table; the live trigger and the client
--     (screenTimeData.ts) already use summary_date. Renaming carries the
--     UNIQUE (user_id, log_date) constraint and its index along.
ALTER TABLE public.daily_summaries RENAME COLUMN log_date TO summary_date;
ALTER TABLE public.daily_summaries
  RENAME CONSTRAINT daily_summaries_user_id_log_date_key
  TO daily_summaries_user_id_summary_date_key;

-- A2. screen_time_logs.local_date = the day as the DEVICE experienced it.
--     Historical rows are backfilled with their UTC date (device tz unknown).
ALTER TABLE public.screen_time_logs ADD COLUMN local_date date;

UPDATE public.screen_time_logs
   SET local_date = COALESCE(session_date, (session_start AT TIME ZONE 'UTC')::date);

ALTER TABLE public.screen_time_logs ALTER COLUMN local_date SET NOT NULL;

CREATE INDEX idx_screen_time_logs_user_local_date
  ON public.screen_time_logs (user_id, local_date);

-- A3. Record dashboard-made drift so the repo describes reality.
--     These objects ALREADY EXIST on the remote (created by hand); IF NOT EXISTS /
--     OR REPLACE make this a no-op there and reproducible everywhere else.
ALTER TABLE public.screen_time_logs ADD COLUMN IF NOT EXISTS session_date date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_screen_time_logs_dedup
  ON public.screen_time_logs (user_id, package_name, session_start);

CREATE OR REPLACE FUNCTION public.fn_set_session_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.session_date := (NEW.session_start AT TIME ZONE 'UTC')::date;
  -- iOS/older clients may not send local_date; fall back to the UTC date.
  NEW.local_date   := COALESCE(NEW.local_date, NEW.session_date);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_session_date ON public.screen_time_logs;
CREATE TRIGGER trg_set_session_date
  BEFORE INSERT ON public.screen_time_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_session_date();

-- A4. One function owns "recompute a user's day"; the trigger and the backfill
--     both call it. Breakdown is keyed by app_name (unique keys by construction).
CREATE OR REPLACE FUNCTION public.rebuild_daily_summary(p_user uuid, p_day date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     integer;
  v_count     integer;
  v_breakdown jsonb;
  v_top_app   text;
  v_top_secs  integer;
BEGIN
  SELECT COALESCE(SUM(duration_seconds), 0)::integer, COUNT(*)::integer
    INTO v_total, v_count
    FROM public.screen_time_logs
   WHERE user_id = p_user AND local_date = p_day;

  IF v_count = 0 THEN
    DELETE FROM public.daily_summaries WHERE user_id = p_user AND summary_date = p_day;
    RETURN;
  END IF;

  WITH per_app AS (
    SELECT app_name, SUM(duration_seconds)::integer AS secs
      FROM public.screen_time_logs
     WHERE user_id = p_user AND local_date = p_day
     GROUP BY app_name
  )
  SELECT jsonb_object_agg(app_name, secs),
         (SELECT app_name FROM per_app ORDER BY secs DESC, app_name LIMIT 1),
         (SELECT secs     FROM per_app ORDER BY secs DESC, app_name LIMIT 1)
    INTO v_breakdown, v_top_app, v_top_secs
    FROM per_app;

  INSERT INTO public.daily_summaries
    (user_id, summary_date, total_seconds, top_app_name, top_app_seconds,
     app_breakdown, session_count, updated_at)
  VALUES
    (p_user, p_day, v_total, v_top_app, v_top_secs, v_breakdown, v_count, now())
  ON CONFLICT (user_id, summary_date) DO UPDATE SET
    total_seconds   = EXCLUDED.total_seconds,
    top_app_name    = EXCLUDED.top_app_name,
    top_app_seconds = EXCLUDED.top_app_seconds,
    app_breakdown   = EXCLUDED.app_breakdown,
    session_count   = EXCLUDED.session_count,
    updated_at      = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_update_daily_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.rebuild_daily_summary(NEW.user_id, NEW.local_date);
  RETURN NEW;
END;
$$;
-- (trigger trg_update_daily_summary already exists and already points at this function)

-- A5. Rebuild every summary from the raw logs (screen_time_logs is untouched).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT user_id, local_date FROM public.screen_time_logs LOOP
    PERFORM public.rebuild_daily_summary(r.user_id, r.local_date);
  END LOOP;
END;
$$;

-- A6. Internal functions must not be callable through the API.
--     (Supabase default privileges grant EXECUTE to anon/authenticated directly.)
REVOKE ALL ON FUNCTION public.rebuild_daily_summary(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_update_daily_summary()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_set_session_date()             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_user()                     FROM PUBLIC, anon;


-- ############################################################################
-- PART B — focus session lifecycle (database is the source of truth)
-- ############################################################################

-- B1. Columns. Table is empty in prod. ended_at must be NULL while a session is open.
ALTER TABLE public.focus_sessions
  ADD COLUMN interruption_count integer NOT NULL DEFAULT 0,
  ADD COLUMN attempt_count      integer NOT NULL DEFAULT 0,   -- blocked-app attempts (native)
  ADD COLUMN blocked_apps       text[]  NOT NULL DEFAULT '{}',-- lets blocking be recovered after a kill
  ADD COLUMN allow_browser      boolean NOT NULL DEFAULT false,
  ADD COLUMN xp_awarded         integer NOT NULL DEFAULT 0,
  ALTER COLUMN ended_at         DROP NOT NULL,
  ALTER COLUMN duration_seconds SET DEFAULT 0;

ALTER TABLE public.focus_sessions DROP CONSTRAINT focus_sessions_status_check;
ALTER TABLE public.focus_sessions
  ADD CONSTRAINT focus_sessions_status_check
  CHECK (status IN ('active', 'interrupted', 'completed', 'ended_early', 'cancelled'));

-- open <=> no end time
ALTER TABLE public.focus_sessions
  ADD CONSTRAINT focus_sessions_end_matches_status
  CHECK ((status IN ('active', 'interrupted')) = (ended_at IS NULL));

ALTER TABLE public.focus_sessions
  ADD CONSTRAINT focus_sessions_planned_range
  CHECK (planned_duration_seconds BETWEEN 60 AND 43200);

ALTER TABLE public.focus_sessions
  ADD CONSTRAINT focus_sessions_counters_nonneg
  CHECK (interruption_count >= 0 AND attempt_count >= 0 AND xp_awarded >= 0);

-- B2. ONE open session per user. 'interrupted' is still an open session
--     (the user can Continue), so the index covers both open states.
CREATE UNIQUE INDEX idx_focus_sessions_one_open_per_user
  ON public.focus_sessions (user_id)
  WHERE status IN ('active', 'interrupted');

-- B3. Clients may READ their sessions but never write them directly: every
--     transition goes through the RPCs below (no client-forged started_at/status/xp).
DROP POLICY "Users can insert their own focus sessions" ON public.focus_sessions;
DROP POLICY "Users can update their own focus sessions" ON public.focus_sessions;
REVOKE INSERT, UPDATE, DELETE ON public.focus_sessions FROM anon, authenticated;
-- (SELECT policy "Users can view their own focus sessions" is kept.)

-- B4. Internal helpers (not callable via the API).
CREATE OR REPLACE FUNCTION public._focus_json(f public.focus_sessions)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT to_jsonb(f) || jsonb_build_object(
    'ends_at',           f.started_at + make_interval(secs => f.planned_duration_seconds),
    'server_now',        now(),
    'elapsed_seconds',   CASE WHEN f.status IN ('active', 'interrupted')
                              THEN LEAST(f.planned_duration_seconds,
                                         GREATEST(0, floor(extract(epoch FROM now() - f.started_at))::integer))
                              ELSE f.duration_seconds END,
    'remaining_seconds', CASE WHEN f.status IN ('active', 'interrupted')
                              THEN GREATEST(0, f.planned_duration_seconds
                                               - floor(extract(epoch FROM now() - f.started_at))::integer)
                              ELSE 0 END
  );
$$;

-- Marks an open session completed. The ONLY place a completion/XP is written,
-- and it only runs on an open row, so a reward can happen at most once.
CREATE OR REPLACE FUNCTION public._focus_apply_complete(v public.focus_sessions, p_attempts integer)
RETURNS public.focus_sessions
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE r public.focus_sessions;
BEGIN
  UPDATE public.focus_sessions
     SET status           = 'completed',
         ended_at         = v.started_at + make_interval(secs => v.planned_duration_seconds),
         duration_seconds = v.planned_duration_seconds,
         attempt_count    = GREATEST(v.attempt_count, COALESCE(p_attempts, 0)),
         -- PLACEHOLDER reward rule: 1 XP per planned minute. Change here only.
         xp_awarded       = GREATEST(1, v.planned_duration_seconds / 60)
   WHERE id = v.id AND status IN ('active', 'interrupted')
   RETURNING * INTO r;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public._focus_json(public.focus_sessions)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._focus_apply_complete(public.focus_sessions, integer) FROM PUBLIC, anon, authenticated;

-- B5. RPCs. All derive the user from auth.uid(); none accepts a user_id.

-- start: the ONLY way a session is created. Idempotent per client-generated id;
-- a second call (double tap, other device) returns the existing open session.
CREATE OR REPLACE FUNCTION public.start_focus_session(
  p_id              uuid,
  p_task            text,
  p_planned_seconds integer,
  p_blocked_apps    text[]  DEFAULT '{}',
  p_allow_browser   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v     public.focus_sessions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENT: id required' USING ERRCODE = 'P0001'; END IF;
  IF p_planned_seconds IS NULL OR p_planned_seconds NOT BETWEEN 60 AND 43200 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: planned duration must be 60..43200 seconds' USING ERRCODE = 'P0001';
  END IF;

  -- serialise all focus writes for this user (double taps / two devices)
  PERFORM pg_advisory_xact_lock(hashtextextended('focus:' || v_uid::text, 0));

  -- same id again = retry of the same tap
  SELECT * INTO v FROM public.focus_sessions WHERE id = p_id;
  IF FOUND THEN
    IF v.user_id <> v_uid THEN RAISE EXCEPTION 'focus session not found' USING ERRCODE = 'P0002'; END IF;
    RETURN public._focus_json(v) || jsonb_build_object('already_active', v.status IN ('active', 'interrupted'));
  END IF;

  -- a different open session already exists?
  SELECT * INTO v FROM public.focus_sessions
   WHERE user_id = v_uid AND status IN ('active', 'interrupted') FOR UPDATE;
  IF FOUND THEN
    IF now() < v.started_at + make_interval(secs => v.planned_duration_seconds) THEN
      RETURN public._focus_json(v) || jsonb_build_object('already_active', true);   -- never a 2nd session
    END IF;
    -- it ran to term while nobody settled it: settle it, then allow a new one
    PERFORM public._focus_apply_complete(v, NULL);
  END IF;

  INSERT INTO public.focus_sessions
    (id, user_id, started_at, planned_duration_seconds, status, task, blocked_apps, allow_browser)
  VALUES
    (p_id, v_uid, now(), p_planned_seconds, 'active',
     NULLIF(left(btrim(COALESCE(p_task, '')), 200), ''),
     COALESCE(p_blocked_apps, '{}'), COALESCE(p_allow_browser, false))
  RETURNING * INTO v;

  RETURN public._focus_json(v) || jsonb_build_object('already_active', false);
END;
$$;

-- get: the open session (status 'active' or 'interrupted') or NULL. Read-only.
CREATE OR REPLACE FUNCTION public.get_active_focus_session()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v     public.focus_sessions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v FROM public.focus_sessions
   WHERE user_id = v_uid AND status IN ('active', 'interrupted')
   ORDER BY started_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN public._focus_json(v);
END;
$$;

-- interrupt: active -> interrupted, interruption_count + 1 (once per interruption;
-- repeat calls while already interrupted do not double count). Clock keeps running.
CREATE OR REPLACE FUNCTION public.interrupt_focus_session(p_id uuid, p_attempt_count integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v     public.focus_sessions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('focus:' || v_uid::text, 0));
  SELECT * INTO v FROM public.focus_sessions WHERE id = p_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'focus session not found' USING ERRCODE = 'P0002'; END IF;

  IF v.status IN ('active', 'interrupted')
     AND now() >= v.started_at + make_interval(secs => v.planned_duration_seconds) THEN
    v := public._focus_apply_complete(v, p_attempt_count);          -- ran to term
  ELSIF v.status = 'active' THEN
    UPDATE public.focus_sessions
       SET status = 'interrupted',
           interruption_count = interruption_count + 1,
           attempt_count = GREATEST(attempt_count, COALESCE(p_attempt_count, 0))
     WHERE id = v.id RETURNING * INTO v;
  END IF;
  RETURN public._focus_json(v);
END;
$$;

-- continue: interrupted -> active. Same id, same started_at, same duration.
CREATE OR REPLACE FUNCTION public.continue_focus_session(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v     public.focus_sessions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('focus:' || v_uid::text, 0));
  SELECT * INTO v FROM public.focus_sessions WHERE id = p_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'focus session not found' USING ERRCODE = 'P0002'; END IF;

  IF v.status IN ('active', 'interrupted')
     AND now() >= v.started_at + make_interval(secs => v.planned_duration_seconds) THEN
    v := public._focus_apply_complete(v, NULL);
  ELSIF v.status = 'interrupted' THEN
    UPDATE public.focus_sessions SET status = 'active' WHERE id = v.id RETURNING * INTO v;
  END IF;
  RETURN public._focus_json(v);
END;
$$;

-- abandon: open -> cancelled. The row is kept (history). If the duration had
-- already been reached the session is settled as completed instead.
CREATE OR REPLACE FUNCTION public.abandon_focus_session(p_id uuid, p_attempt_count integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v     public.focus_sessions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('focus:' || v_uid::text, 0));
  SELECT * INTO v FROM public.focus_sessions WHERE id = p_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'focus session not found' USING ERRCODE = 'P0002'; END IF;

  IF v.status IN ('active', 'interrupted') THEN
    IF now() >= v.started_at + make_interval(secs => v.planned_duration_seconds) THEN
      v := public._focus_apply_complete(v, p_attempt_count);
    ELSE
      UPDATE public.focus_sessions
         SET status           = 'cancelled',
             ended_at         = now(),
             duration_seconds = GREATEST(0, floor(extract(epoch FROM now() - v.started_at))::integer),
             attempt_count    = GREATEST(attempt_count, COALESCE(p_attempt_count, 0))
       WHERE id = v.id RETURNING * INTO v;
    END IF;
  END IF;
  RETURN public._focus_json(v);
END;
$$;

-- complete: open -> completed once the duration has elapsed (2 s tolerance for
-- clock rounding). Idempotent: repeat calls return the stored row and change nothing,
-- so XP is awarded exactly once (only an open row can be completed).
CREATE OR REPLACE FUNCTION public.complete_focus_session(p_id uuid, p_attempt_count integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v     public.focus_sessions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('focus:' || v_uid::text, 0));
  SELECT * INTO v FROM public.focus_sessions WHERE id = p_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'focus session not found' USING ERRCODE = 'P0002'; END IF;

  IF v.status = 'completed' THEN
    RETURN public._focus_json(v);                                   -- idempotent replay
  ELSIF v.status NOT IN ('active', 'interrupted') THEN
    RAISE EXCEPTION 'SESSION_ALREADY_CLOSED: status is %', v.status USING ERRCODE = 'P0001';
  ELSIF now() < v.started_at + make_interval(secs => v.planned_duration_seconds) - interval '2 seconds' THEN
    RAISE EXCEPTION 'SESSION_NOT_FINISHED' USING ERRCODE = 'P0001';
  END IF;

  v := public._focus_apply_complete(v, p_attempt_count);
  RETURN public._focus_json(v);
END;
$$;

-- sync attempts: keep the native blocked-attempt counter in the DB while running.
CREATE OR REPLACE FUNCTION public.sync_focus_attempts(p_id uuid, p_attempt_count integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  UPDATE public.focus_sessions
     SET attempt_count = GREATEST(attempt_count, COALESCE(p_attempt_count, 0))
   WHERE id = p_id AND user_id = auth.uid() AND status IN ('active', 'interrupted');
END;
$$;

-- B6. Only signed-in users may call the RPCs (default privileges also grant anon).
REVOKE ALL ON FUNCTION public.start_focus_session(uuid, text, integer, text[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_active_focus_session()                                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.interrupt_focus_session(uuid, integer)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.continue_focus_session(uuid)                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.abandon_focus_session(uuid, integer)                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_focus_session(uuid, integer)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_focus_attempts(uuid, integer)                        FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.start_focus_session(uuid, text, integer, text[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_focus_session()                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.interrupt_focus_session(uuid, integer)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.continue_focus_session(uuid)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_focus_session(uuid, integer)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_focus_session(uuid, integer)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_focus_attempts(uuid, integer)                        TO authenticated;
