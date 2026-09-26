-- ============================================================================
-- COOKED — focus session pause/resume, tracked in the DB
--
-- Depends on 20260924120000_repair_schema_and_focus_lifecycle.sql.
--
-- Problem this fixes: pause/resume was purely local + native. started_at
-- never moved, so a kill while paused made recovery compute elapsed time as
-- if the pause never happened -> the user came back to less time than they
-- actually had left. Fix: track the paused interval in the row itself, and
-- make every elapsed/remaining calculation subtract it.
-- ============================================================================

ALTER TABLE public.focus_sessions
  ADD COLUMN paused_at      timestamptz,          -- set while a pause is in progress; NULL otherwise
  ADD COLUMN paused_seconds integer NOT NULL DEFAULT 0;  -- accumulated from PAST (completed) pauses only

ALTER TABLE public.focus_sessions
  ADD CONSTRAINT focus_sessions_paused_only_when_open
  CHECK (paused_at IS NULL OR status IN ('active', 'interrupted'));

ALTER TABLE public.focus_sessions
  ADD CONSTRAINT focus_sessions_paused_seconds_nonneg
  CHECK (paused_seconds >= 0);

-- Effective elapsed *focused* seconds: wall-clock time since start, minus every
-- pause (past ones from paused_seconds, plus the one in progress if any). Not
-- capped to planned_duration_seconds — callers cap where they need to.
CREATE OR REPLACE FUNCTION public._focus_elapsed(f public.focus_sessions)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT GREATEST(0,
    FLOOR(EXTRACT(EPOCH FROM now() - f.started_at))::integer
    - f.paused_seconds
    - CASE WHEN f.paused_at IS NOT NULL
           THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM now() - f.paused_at))::integer)
           ELSE 0 END
  );
$$;
REVOKE ALL ON FUNCTION public._focus_elapsed(public.focus_sessions) FROM PUBLIC, anon, authenticated;

-- Replaces the version from the previous migration: elapsed/remaining now
-- account for pauses, and ends_at is only a rough "if nothing else pauses"
-- projection — remaining_seconds is the number the client should trust.
CREATE OR REPLACE FUNCTION public._focus_json(f public.focus_sessions)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT to_jsonb(f) || jsonb_build_object(
    'ends_at',           f.started_at + make_interval(secs => f.planned_duration_seconds + f.paused_seconds),
    'server_now',        now(),
    'is_paused',         f.paused_at IS NOT NULL,
    'elapsed_seconds',   CASE WHEN f.status IN ('active', 'interrupted')
                              THEN LEAST(f.planned_duration_seconds, public._focus_elapsed(f))
                              ELSE f.duration_seconds END,
    'remaining_seconds', CASE WHEN f.status IN ('active', 'interrupted')
                              THEN GREATEST(0, f.planned_duration_seconds - public._focus_elapsed(f))
                              ELSE 0 END
  );
$$;

-- _focus_apply_complete: duration is always the full planned amount (pauses
-- are, by definition, not focused time), but ended_at is the real wall clock
-- moment it was settled, not a naive started_at+planned that ignores pauses.
CREATE OR REPLACE FUNCTION public._focus_apply_complete(v public.focus_sessions, p_attempts integer)
RETURNS public.focus_sessions
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE r public.focus_sessions;
BEGIN
  UPDATE public.focus_sessions
     SET status           = 'completed',
         ended_at         = now(),
         duration_seconds = v.planned_duration_seconds,
         paused_at        = NULL,
         attempt_count    = GREATEST(v.attempt_count, COALESCE(p_attempts, 0)),
         xp_awarded       = GREATEST(1, v.planned_duration_seconds / 60)
   WHERE id = v.id AND status IN ('active', 'interrupted')
   RETURNING * INTO r;
  RETURN r;
END;
$$;

-- start / interrupt / continue / abandon / complete: replace the "has the
-- planned time actually elapsed?" check (previously naive wall-clock vs.
-- started_at) with the pause-aware version, and make abandon's saved
-- duration exclude paused time.

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

  PERFORM pg_advisory_xact_lock(hashtextextended('focus:' || v_uid::text, 0));

  SELECT * INTO v FROM public.focus_sessions WHERE id = p_id;
  IF FOUND THEN
    IF v.user_id <> v_uid THEN RAISE EXCEPTION 'focus session not found' USING ERRCODE = 'P0002'; END IF;
    RETURN public._focus_json(v) || jsonb_build_object('already_active', v.status IN ('active', 'interrupted'));
  END IF;

  SELECT * INTO v FROM public.focus_sessions
   WHERE user_id = v_uid AND status IN ('active', 'interrupted') FOR UPDATE;
  IF FOUND THEN
    IF public._focus_elapsed(v) < v.planned_duration_seconds THEN
      RETURN public._focus_json(v) || jsonb_build_object('already_active', true);
    END IF;
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

  IF v.status IN ('active', 'interrupted') AND public._focus_elapsed(v) >= v.planned_duration_seconds THEN
    v := public._focus_apply_complete(v, p_attempt_count);
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

  IF v.status IN ('active', 'interrupted') AND public._focus_elapsed(v) >= v.planned_duration_seconds THEN
    v := public._focus_apply_complete(v, NULL);
  ELSIF v.status = 'interrupted' THEN
    UPDATE public.focus_sessions SET status = 'active' WHERE id = v.id RETURNING * INTO v;
  END IF;
  RETURN public._focus_json(v);
END;
$$;

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
    IF public._focus_elapsed(v) >= v.planned_duration_seconds THEN
      v := public._focus_apply_complete(v, p_attempt_count);
    ELSE
      UPDATE public.focus_sessions
         SET status           = 'cancelled',
             ended_at         = now(),
             duration_seconds = public._focus_elapsed(v),   -- excludes paused time
             paused_at        = NULL,
             attempt_count    = GREATEST(attempt_count, COALESCE(p_attempt_count, 0))
       WHERE id = v.id RETURNING * INTO v;
    END IF;
  END IF;
  RETURN public._focus_json(v);
END;
$$;

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
    RETURN public._focus_json(v);
  ELSIF v.status NOT IN ('active', 'interrupted') THEN
    RAISE EXCEPTION 'SESSION_ALREADY_CLOSED: status is %', v.status USING ERRCODE = 'P0001';
  ELSIF public._focus_elapsed(v) < v.planned_duration_seconds - 2 THEN
    RAISE EXCEPTION 'SESSION_NOT_FINISHED' USING ERRCODE = 'P0001';
  END IF;

  v := public._focus_apply_complete(v, p_attempt_count);
  RETURN public._focus_json(v);
END;
$$;

-- New RPCs: pause / resume. Idempotent — pausing an already-paused session
-- (or resuming one that isn't paused) is a no-op that returns current state,
-- so a double-tap or a retried call can never double-count a pause interval.
CREATE OR REPLACE FUNCTION public.pause_focus_session(p_id uuid)
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

  IF v.status = 'active' AND public._focus_elapsed(v) >= v.planned_duration_seconds THEN
    v := public._focus_apply_complete(v, NULL);
  ELSIF v.status = 'active' AND v.paused_at IS NULL THEN
    UPDATE public.focus_sessions SET paused_at = now() WHERE id = v.id RETURNING * INTO v;
  END IF;
  RETURN public._focus_json(v);
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_focus_session(p_id uuid)
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

  IF v.status = 'active' AND v.paused_at IS NOT NULL THEN
    UPDATE public.focus_sessions
       SET paused_seconds = paused_seconds + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM now() - paused_at))::integer),
           paused_at      = NULL
     WHERE id = v.id RETURNING * INTO v;
  END IF;
  RETURN public._focus_json(v);
END;
$$;

REVOKE ALL ON FUNCTION public.pause_focus_session(uuid)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resume_focus_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pause_focus_session(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_focus_session(uuid) TO authenticated;
