-- ============================================================================
-- COOKED — Focus Session RPCs and Constraints
-- ============================================================================

-- 1. Ensure 'active' is allowed in the status check constraint
ALTER TABLE public.focus_sessions
  DROP CONSTRAINT IF EXISTS focus_sessions_status_check;

ALTER TABLE public.focus_sessions
  ADD CONSTRAINT focus_sessions_status_check
  CHECK (status IN ('active', 'completed', 'ended_early', 'cancelled'));

-- 2. Ensure only ONE active session per user exists at any time
DROP INDEX IF EXISTS idx_focus_sessions_single_active;
CREATE UNIQUE INDEX idx_focus_sessions_single_active
  ON public.focus_sessions (user_id)
  WHERE status = 'active';

-- 3. RPC to fetch the current active focus session securely
CREATE OR REPLACE FUNCTION public.get_active_focus_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session jsonb;
BEGIN
  SELECT row_to_json(f)::jsonb INTO v_session
  FROM public.focus_sessions f
  WHERE user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  RETURN v_session;
END;
$$;
