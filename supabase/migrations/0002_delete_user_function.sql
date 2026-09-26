-- ============================================================================
-- delete_user()
-- Lets a user delete their own account from the client.
-- Runs as SECURITY DEFINER so it can call auth.users delete.
-- Cascade on user_id foreign keys handles all app data automatically.
-- ============================================================================
-- NOTE: restored VERBATIM from the remote migration history (version 0002).

create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Delete the user from auth.users
  -- on delete cascade handles: screen_time_logs, daily_summaries, ingest_errors
  delete from auth.users where id = auth.uid();
end;
$$;

-- Only the authenticated user themselves can call this
revoke all on function public.delete_user() from public;

grant execute on function public.delete_user() to authenticated;
