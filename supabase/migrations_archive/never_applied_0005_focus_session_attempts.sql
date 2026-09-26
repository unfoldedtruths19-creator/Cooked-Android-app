-- ============================================================================
-- COOKED — Persist blocked-app attempt counts per session
--
-- The native module already tracks attempt_count per focus session and
-- returns it when the session ends, but the client only ever used it for
-- the one-off roast screen params — it was never saved, so the "Distractions"
-- tile on Today always read 0.
-- ============================================================================

ALTER TABLE public.focus_sessions
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.focus_sessions.attempt_count IS
  'Number of times the user opened a blocked app during this session.';
