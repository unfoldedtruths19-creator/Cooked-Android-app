-- ============================================================================
-- COOKED — Schema fixes
-- 1. Allow NULL raw_payload in ingest_errors (auth errors have no payload)
-- 2. Add unique constraint on screen_time_logs for deduplication
-- 3. Fix fn_update_daily_summary to aggregate by package_name first, 
--    then resolve display name — avoids duplicate key collision in jsonb_object_agg
-- ============================================================================

-- Fix 1: raw_payload should be nullable — auth errors have no request body
ALTER TABLE public.ingest_errors
  ALTER COLUMN raw_payload DROP NOT NULL;

-- Fix 2: Deduplication key on screen_time_logs
-- Unique per user + package + session window. Prevents duplicate rows when
-- the device re-syncs the same sessions (e.g. after a failed upload retry).
ALTER TABLE public.screen_time_logs
  ADD COLUMN IF NOT EXISTS session_fingerprint text
    GENERATED ALWAYS AS (
      user_id::text || '|' || package_name || '|' ||
      extract(epoch from session_start)::bigint::text
    ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS idx_screen_time_logs_dedup
  ON public.screen_time_logs (session_fingerprint);

-- Fix 3: Rewrite trigger to aggregate by package_name (stable), resolve
-- display name once per package — prevents jsonb_object_agg key collisions
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

  -- Aggregate by package_name (unique), carry app_name along for display.
  -- Using MAX(app_name) per package is safe because app_name is derived
  -- deterministically from package_name via humanizePackageName.
  WITH per_package AS (
    SELECT
      MAX(app_name)                  AS app_name,
      SUM(duration_seconds)          AS pkg_seconds
    FROM public.screen_time_logs
    WHERE user_id = NEW.user_id
      AND (session_start AT TIME ZONE 'UTC')::date = v_day
    GROUP BY package_name
  )
  SELECT
    COALESCE(SUM(pkg_seconds), 0),
    COUNT(*),
    COALESCE(
      jsonb_object_agg(app_name, pkg_seconds)
        FILTER (WHERE app_name IS NOT NULL),
      '{}'::jsonb
    )
  INTO v_total, v_count, v_breakdown
  FROM per_package;

  -- Top app by total seconds
  SELECT app_name, pkg_seconds
  INTO v_top_app, v_top_seconds
  FROM (
    SELECT
      MAX(app_name) AS app_name,
      SUM(duration_seconds) AS pkg_seconds
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

-- Recreate trigger (function replace doesn't touch trigger, but be explicit)
DROP TRIGGER IF EXISTS trg_update_daily_summary ON public.screen_time_logs;
CREATE TRIGGER trg_update_daily_summary
  AFTER INSERT ON public.screen_time_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_update_daily_summary();
