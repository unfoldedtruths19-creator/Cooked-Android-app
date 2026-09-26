-- ============================================================================
-- COOKED — Schema fixes v3
-- 1. Fix trigger: session_count = total sessions, not distinct packages
-- 2. Add CHECK constraint on ingest_errors.error_stage
-- 3. Add task column to focus_sessions
-- ============================================================================

-- Fix 1: session_count should be total number of usage sessions (rows),
-- not the number of distinct packages. The old COUNT(*) on per_package
-- was counting packages. Fix: count raw rows from screen_time_logs directly.
CREATE OR REPLACE FUNCTION public.fn_update_daily_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day         date;
  v_breakdown   jsonb;
  v_total       int;
  v_count       int;
  v_top_app     text;
  v_top_seconds int;
BEGIN
  v_day := (NEW.session_start AT TIME ZONE 'UTC')::date;

  -- Total seconds and true session count (raw rows = individual usage events)
  SELECT
    COALESCE(SUM(duration_seconds), 0),
    COUNT(*)
  INTO v_total, v_count
  FROM public.screen_time_logs
  WHERE user_id = NEW.user_id
    AND (session_start AT TIME ZONE 'UTC')::date = v_day;

  -- App breakdown: aggregate by package_name, use MAX(app_name) as display key
  SELECT COALESCE(
    jsonb_object_agg(app_name, pkg_seconds)
      FILTER (WHERE app_name IS NOT NULL),
    '{}'::jsonb
  )
  INTO v_breakdown
  FROM (
    SELECT MAX(app_name) AS app_name, SUM(duration_seconds) AS pkg_seconds
    FROM public.screen_time_logs
    WHERE user_id = NEW.user_id
      AND (session_start AT TIME ZONE 'UTC')::date = v_day
    GROUP BY package_name
  ) per_pkg;

  -- Top app
  SELECT app_name, pkg_seconds
  INTO v_top_app, v_top_seconds
  FROM (
    SELECT MAX(app_name) AS app_name, SUM(duration_seconds) AS pkg_seconds
    FROM public.screen_time_logs
    WHERE user_id = NEW.user_id
      AND (session_start AT TIME ZONE 'UTC')::date = v_day
    GROUP BY package_name
    ORDER BY pkg_seconds DESC
    LIMIT 1
  ) top_pkg;

  INSERT INTO public.daily_summaries (
    user_id, summary_date, total_seconds, top_app_name, top_app_seconds,
    app_breakdown, session_count, updated_at
  )
  VALUES (
    NEW.user_id, v_day, v_total, v_top_app, COALESCE(v_top_seconds, 0),
    v_breakdown, v_count, NOW()
  )
  ON CONFLICT (user_id, summary_date)
  DO UPDATE SET
    total_seconds   = EXCLUDED.total_seconds,
    top_app_name    = EXCLUDED.top_app_name,
    top_app_seconds = EXCLUDED.top_app_seconds,
    app_breakdown   = EXCLUDED.app_breakdown,
    session_count   = EXCLUDED.session_count,
    updated_at      = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_daily_summary ON public.screen_time_logs;
CREATE TRIGGER trg_update_daily_summary
  AFTER INSERT ON public.screen_time_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_daily_summary();

-- Fix 2: constrain error_stage to known values
ALTER TABLE public.ingest_errors
  DROP CONSTRAINT IF EXISTS ingest_errors_error_stage_check;

ALTER TABLE public.ingest_errors
  ADD COLUMN IF NOT EXISTS error_stage text;

ALTER TABLE public.ingest_errors
  ADD CONSTRAINT ingest_errors_error_stage_check
  CHECK (error_stage IN ('auth', 'validation', 'write', 'normalization'));

-- Fix 3: add task column to focus_sessions — nullable so old rows still valid
ALTER TABLE public.focus_sessions
  ADD COLUMN IF NOT EXISTS task text;

COMMENT ON COLUMN public.focus_sessions.task IS
  'What the user said they were working on when starting this session.';
