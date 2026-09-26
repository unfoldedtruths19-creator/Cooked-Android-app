-- ============================================================================
-- COOKED — Fix UTC/local-date mismatch
--
-- The dashboard reads daily_summaries by the device's LOCAL calendar date,
-- but fn_update_daily_summary grouped rows by (session_start AT TIME ZONE
-- 'UTC')::date. For anyone east of UTC (e.g. IST, UTC+5:30), usage late in
-- the local evening rolls into "tomorrow" in UTC, so it silently lands in
-- the wrong day's summary and streaks/today's totals come out wrong.
--
-- Fix: the client now knows its own timezone, so it sends local_date
-- ('YYYY-MM-DD' computed in the device's timezone) per session. We store
-- that directly and group by it — no timezone math happens in Postgres.
-- ============================================================================

ALTER TABLE public.daily_summaries
  ADD COLUMN IF NOT EXISTS summary_date date;

ALTER TABLE public.screen_time_logs
  ADD COLUMN IF NOT EXISTS local_date date;

-- Backfill existing rows with their UTC date as a best-effort approximation
-- (we don't know the historical device timezone for old rows).
UPDATE public.screen_time_logs
  SET local_date = (session_start AT TIME ZONE 'UTC')::date
  WHERE local_date IS NULL;

ALTER TABLE public.screen_time_logs
  ALTER COLUMN local_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_screen_time_logs_user_local_date
  ON public.screen_time_logs (user_id, local_date);

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
  v_day := NEW.local_date;

  SELECT
    COALESCE(SUM(duration_seconds), 0),
    COUNT(*)
  INTO v_total, v_count
  FROM public.screen_time_logs
  WHERE user_id = NEW.user_id
    AND local_date = v_day;

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
      AND local_date = v_day
    GROUP BY package_name
  ) per_pkg;

  SELECT app_name, pkg_seconds
  INTO v_top_app, v_top_seconds
  FROM (
    SELECT MAX(app_name) AS app_name, SUM(duration_seconds) AS pkg_seconds
    FROM public.screen_time_logs
    WHERE user_id = NEW.user_id
      AND local_date = v_day
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

-- One-time repair: recompute daily_summaries directly from screen_time_logs
-- now that grouping has changed from UTC date to local_date (the trigger
-- only fires on new inserts, so existing rows need this explicit backfill).
INSERT INTO public.daily_summaries (
  user_id, summary_date, total_seconds, top_app_name, top_app_seconds,
  app_breakdown, session_count, updated_at
)
SELECT
  totals.user_id,
  totals.local_date,
  totals.total_seconds,
  top.app_name,
  top.pkg_seconds,
  totals.app_breakdown,
  totals.session_count,
  NOW()
FROM (
  SELECT
    user_id,
    local_date,
    SUM(duration_seconds) AS total_seconds,
    COUNT(*) AS session_count,
    jsonb_object_agg(app_name, pkg_seconds) FILTER (WHERE app_name IS NOT NULL) AS app_breakdown
  FROM (
    SELECT user_id, local_date, MAX(app_name) AS app_name, SUM(duration_seconds) AS pkg_seconds
    FROM public.screen_time_logs
    GROUP BY user_id, local_date, package_name
  ) per_pkg
  GROUP BY user_id, local_date
) totals
JOIN LATERAL (
  SELECT MAX(app_name) AS app_name, SUM(duration_seconds) AS pkg_seconds
  FROM public.screen_time_logs s
  WHERE s.user_id = totals.user_id AND s.local_date = totals.local_date
  GROUP BY package_name
  ORDER BY pkg_seconds DESC
  LIMIT 1
) top ON true
ON CONFLICT (user_id, summary_date)
DO UPDATE SET
  total_seconds   = EXCLUDED.total_seconds,
  top_app_name    = EXCLUDED.top_app_name,
  top_app_seconds = EXCLUDED.top_app_seconds,
  app_breakdown   = EXCLUDED.app_breakdown,
  session_count   = EXCLUDED.session_count,
  updated_at      = NOW();
