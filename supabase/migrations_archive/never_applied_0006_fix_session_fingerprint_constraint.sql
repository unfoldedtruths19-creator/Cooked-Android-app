-- ============================================================================
-- COOKED — Fix Sync 500
-- Upgrade the unique index to a unique constraint for PostgREST upsert
-- ============================================================================

ALTER TABLE public.screen_time_logs
  ADD CONSTRAINT screen_time_logs_session_fingerprint_key
  UNIQUE USING INDEX idx_screen_time_logs_dedup;
