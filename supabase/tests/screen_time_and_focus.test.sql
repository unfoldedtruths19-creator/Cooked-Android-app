-- ============================================================================
-- Tests for 20260924120000_repair_schema_and_focus_lifecycle.sql
--
-- Run ONLY against a scratch database (never the remote), after migrations:
--   psql -v ON_ERROR_STOP=1 -d scratch -f supabase/tests/screen_time_and_focus.test.sql
-- Run WITHOUT --single-transaction: each statement needs its own now().
-- Requires two rows in auth.users (users A and B below) and Supabase-style roles.
-- Every check either prints "PASS ..." or aborts the script with "FAIL ...".
-- ============================================================================
\set ON_ERROR_STOP on
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set S1 '''11111111-1111-1111-1111-111111111111'''
\set S2 '''22222222-2222-2222-2222-222222222222'''
\set S3 '''33333333-3333-3333-3333-333333333333'''
\set S4 '''44444444-4444-4444-4444-444444444444'''
\set S5 '''55555555-5555-5555-5555-555555555555'''
\set S6 '''66666666-6666-6666-6666-666666666666'''
\set ON_ERROR_ROLLBACK off
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- helpers (test-only schema, dropped at the end)
create schema tt;
grant usage on schema tt to anon, authenticated;
create function tt.ok(cond boolean, name text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', name; end if;
  raise notice 'PASS: %', name;
end $$;
create function tt.expect_error(q text, pat text) returns void language plpgsql as $$
declare got boolean := false;
begin
  begin
    execute q;
  exception when others then
    if sqlerrm like '%' || pat || '%' then got := true;
    else raise exception 'FAIL: wanted error like [%] but got [%] for: %', pat, sqlerrm, q; end if;
  end;
  if not got then raise exception 'FAIL: expected error [%] but statement succeeded: %', pat, q; end if;
  raise notice 'PASS: error [%] raised', pat;
end $$;

-- clean slate for repeatable runs
delete from public.focus_sessions;

-- =========================== SCREEN-TIME PIPELINE ============================
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;

-- ingest exactly like PostgREST upsert(ignoreDuplicates): ON CONFLICT (cols) DO NOTHING
insert into public.screen_time_logs (user_id, device_id, platform, package_name, app_name, session_start, session_end, duration_seconds, local_date)
values (:A, 'dev1', 'android', 'com.test.a', 'TestA', '2026-09-02T19:30:00Z', '2026-09-02T19:40:00Z', 600, '2026-09-03')
on conflict (user_id, package_name, session_start) do nothing;
select tt.ok((select count(*) from public.screen_time_logs where package_name='com.test.a') = 1,
             'S1 authenticated user can ingest a log (trigger works under RLS + revoked EXECUTE)');
select tt.ok((select total_seconds from public.daily_summaries where summary_date = '2026-09-03') = 600
         and (select count(*) from public.daily_summaries where summary_date = '2026-09-02' and app_breakdown ? 'TestA') = 0,
             'S2 summary lands on the DEVICE-local day (09-03), not the UTC day (09-02)');

insert into public.screen_time_logs (user_id, device_id, platform, package_name, app_name, session_start, session_end, duration_seconds, local_date)
values (:A, 'dev1', 'android', 'com.test.a', 'TestA', '2026-09-02T19:30:00Z', '2026-09-02T19:40:00Z', 600, '2026-09-03')
on conflict (user_id, package_name, session_start) do nothing;
select tt.ok((select count(*) from public.screen_time_logs where package_name='com.test.a') = 1
         and (select total_seconds from public.daily_summaries where summary_date = '2026-09-03') = 600
         and (select session_count from public.daily_summaries where summary_date = '2026-09-03') = 1,
             'S3 replaying the same session inserts nothing and does not double-count');

insert into public.screen_time_logs (user_id, platform, package_name, app_name, session_start, session_end, duration_seconds)
values (:A, 'android', 'com.test.b', 'TestB', '2026-09-04T08:00:00Z', '2026-09-04T08:01:00Z', 60);
select tt.ok((select local_date from public.screen_time_logs where package_name='com.test.b') = '2026-09-04',
             'S4 missing local_date falls back to the UTC date (older clients)');

select tt.ok((select count(*) from public.screen_time_logs where user_id = :B) = 0
         and (select count(*) from public.daily_summaries   where user_id = :B) = 0,
             'S5 RLS: user A cannot read user B screen-time data');
select tt.expect_error('insert into public.daily_summaries (user_id, summary_date) values (''aaaaaaaa-0000-0000-0000-00000000000a'', current_date)',
                       'row-level security');
select tt.expect_error('select public.rebuild_daily_summary(''aaaaaaaa-0000-0000-0000-00000000000a'', current_date)', 'permission denied');
select tt.expect_error('select public.fn_update_daily_summary()', 'permission denied');
reset role;

-- =========================== FOCUS SESSION LIFECYCLE =========================
set role anon;
select tt.expect_error('select public.start_focus_session(''11111111-1111-1111-1111-111111111111'', ''x'', 600)', 'permission denied');
select tt.expect_error('select public.get_active_focus_session()', 'permission denied');
reset role;

select set_config('request.jwt.claim.sub', :A, false); set role authenticated;

select tt.ok(public.get_active_focus_session() is null, 'F1 no open session -> get_active_focus_session() is NULL (Home, not Focus)');

select tt.expect_error('insert into public.focus_sessions (id,user_id,started_at,planned_duration_seconds,status) values (gen_random_uuid(), ''aaaaaaaa-0000-0000-0000-00000000000a'', now(), 600, ''active'')', 'permission denied');
select tt.expect_error('update public.focus_sessions set status = ''completed''', 'permission denied');
select tt.expect_error('delete from public.focus_sessions', 'permission denied');

select tt.expect_error('select public.start_focus_session(''11111111-1111-1111-1111-111111111111'', ''x'', 30)', 'INVALID_ARGUMENT');

-- start (explicit final Start)
select public.start_focus_session(:S1, '  write essay  ', 600, array['com.instagram.android','com.zhiliaoapp.musically'], false)->>'started_at' as s1_started \gset
select tt.ok((public.get_active_focus_session()->>'id') = '11111111-1111-1111-1111-111111111111'
         and (public.get_active_focus_session()->>'status') = 'active'
         and (public.get_active_focus_session()->>'task') = 'write essay'
         and (public.get_active_focus_session()->>'ended_at') is null,
             'F2 start creates ONE active DB row (task trimmed, ended_at NULL)');

-- double tap: same id, and a different id
select tt.ok((public.start_focus_session(:S1, 'write essay', 600)->>'already_active')::boolean
         and (public.start_focus_session(:S1, 'write essay', 600)->>'started_at') = :'s1_started',
             'F3 double tap (same id) returns the same session, started_at unchanged');
select tt.ok((public.start_focus_session(:S2, 'other', 900)->>'id') = '11111111-1111-1111-1111-111111111111'
         and (public.start_focus_session(:S2, 'other', 900)->>'already_active')::boolean,
             'F4 start with a DIFFERENT id while one is open returns the existing session (no second session)');
select tt.ok((select count(*) from public.focus_sessions where status in ('active','interrupted')) = 1
         and (select count(*) from public.focus_sessions) = 1,
             'F5 exactly one row exists after 4 start calls');

-- wall clock is authoritative: pretend the app was backgrounded for 60 s
reset role; update public.focus_sessions set started_at = started_at - interval '60 seconds' where id = :S1;
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select tt.ok((public.get_active_focus_session()->>'elapsed_seconds')::int between 60 and 64
         and (public.get_active_focus_session()->>'remaining_seconds')::int between 536 and 540,
             'F6 60 s of wall clock -> ~60 s elapsed / ~540 s remaining, computed from started_at');

-- interrupt (roast) does not reset anything and is not double counted
select public.interrupt_focus_session(:S1, 2)->>'started_at' as s1_after_interrupt \gset
select tt.ok((public.get_active_focus_session()->>'status') = 'interrupted'
         and (public.get_active_focus_session()->>'interruption_count')::int = 1
         and (public.get_active_focus_session()->>'attempt_count')::int = 2,
             'F7 interrupt: status interrupted, interruption_count = 1, native attempts saved');
select tt.ok((public.interrupt_focus_session(:S1)->>'interruption_count')::int = 1,
             'F8 pressing interrupt again does not double count');

-- continue keeps identity
select public.continue_focus_session(:S1) as cont \gset
select tt.ok((:'cont'::jsonb->>'id') = '11111111-1111-1111-1111-111111111111'
         and (:'cont'::jsonb->>'status') = 'active'
         and (:'cont'::jsonb->>'started_at') = :'s1_after_interrupt'   -- unchanged by interrupt+continue
         and (:'cont'::jsonb->>'planned_duration_seconds')::int = 600
         and (:'cont'::jsonb->>'task') = 'write essay'
         and (:'cont'::jsonb->>'interruption_count')::int = 1,
             'F9 continue: same id, same started_at, same duration, same task, interruption_count kept');
select tt.ok((select count(*) from public.focus_sessions) = 1, 'F10 continue never creates a second row');

select public.sync_focus_attempts(:S1, 5);
select public.sync_focus_attempts(:S1, 3);
select tt.ok((public.get_active_focus_session()->>'attempt_count')::int = 5, 'F11 attempt counter only moves forward');

select tt.expect_error('select public.complete_focus_session(''11111111-1111-1111-1111-111111111111'')', 'SESSION_NOT_FINISHED');

-- another user cannot touch it
select set_config('request.jwt.claim.sub', :B, false);
select tt.ok(public.get_active_focus_session() is null and (select count(*) from public.focus_sessions) = 0,
             'F12 user B sees no sessions of user A (RLS + auth.uid())');
select tt.expect_error('select public.interrupt_focus_session(''11111111-1111-1111-1111-111111111111'')', 'not found');
select tt.expect_error('select public.continue_focus_session(''11111111-1111-1111-1111-111111111111'')', 'not found');
select tt.expect_error('select public.abandon_focus_session(''11111111-1111-1111-1111-111111111111'')', 'not found');
select tt.expect_error('select public.complete_focus_session(''11111111-1111-1111-1111-111111111111'')', 'not found');
select tt.expect_error('select public.start_focus_session(''11111111-1111-1111-1111-111111111111'', ''steal'', 600)', 'not found');
select set_config('request.jwt.claim.sub', :A, false);

-- abandon keeps history and frees the slot
select public.abandon_focus_session(:S1, 6) as ab \gset
select tt.ok((:'ab'::jsonb->>'status') = 'cancelled'
         and (:'ab'::jsonb->>'ended_at') is not null
         and (:'ab'::jsonb->>'duration_seconds')::int between 60 and 66
         and (:'ab'::jsonb->>'attempt_count')::int = 6
         and (select count(*) from public.focus_sessions where id = :S1) = 1
         and public.get_active_focus_session() is null,
             'F13 abandon: status cancelled, ended_at + actual elapsed saved, row kept, no open session left');
select tt.ok((public.abandon_focus_session(:S1)->>'status') = 'cancelled'
         and (public.interrupt_focus_session(:S1)->>'status') = 'cancelled'
         and (public.continue_focus_session(:S1)->>'status') = 'cancelled',
             'F14 a cancelled session cannot be revived by interrupt/continue');
select tt.expect_error('select public.complete_focus_session(''11111111-1111-1111-1111-111111111111'')', 'SESSION_ALREADY_CLOSED');

-- complete + idempotency (exactly-once reward)
select public.start_focus_session(:S3, 'math', 600)->>'id' as s3 \gset
reset role; update public.focus_sessions set started_at = started_at - interval '700 seconds' where id = :S3;
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select public.complete_focus_session(:S3, 4) as c1 \gset
select public.complete_focus_session(:S3, 999) as c2 \gset
select public.interrupt_focus_session(:S3) as c3 \gset
select public.abandon_focus_session(:S3) as c4 \gset
select tt.ok((:'c1'::jsonb->>'status') = 'completed'
         and (:'c1'::jsonb->>'xp_awarded')::int = 10
         and (:'c1'::jsonb->>'duration_seconds')::int = 600
         and (:'c1'::jsonb->>'attempt_count')::int = 4
         and (:'c1'::jsonb->>'ended_at') is not null,
             'F15 complete: completed, duration = planned, XP awarded, ended_at set');
select tt.ok((:'c2'::jsonb->>'xp_awarded') = (:'c1'::jsonb->>'xp_awarded')
         and (:'c2'::jsonb->>'ended_at') = (:'c1'::jsonb->>'ended_at')
         and (:'c2'::jsonb->>'attempt_count') = (:'c1'::jsonb->>'attempt_count')
         and (:'c3'::jsonb->>'status') = 'completed' and (:'c4'::jsonb->>'status') = 'completed'
         and (select sum(xp_awarded) from public.focus_sessions where status = 'completed') = 10,
             'F16 repeated complete / interrupt / abandon change nothing: reward and streak input happen exactly once');
select tt.ok((select count(*) from public.focus_sessions where status = 'completed') = 1, 'F17 exactly one completed session counts toward streak');

-- a session that ran to term while nobody settled it does not block the next Start
select public.start_focus_session(:S4, 'old', 600)->>'id' as s4 \gset
reset role; update public.focus_sessions set started_at = started_at - interval '900 seconds' where id = :S4;
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select public.start_focus_session(:S5, 'new', 600)->>'id' as s5 \gset
select tt.ok(:'s5' = '55555555-5555-5555-5555-555555555555'
         and (select status from public.focus_sessions where id = :S4) = 'completed'
         and (select count(*) from public.focus_sessions where status in ('active','interrupted')) = 1,
             'F18 expired-but-unsettled session is settled as completed, new session starts, still one open');
select tt.ok((public.interrupt_focus_session(:S5)->>'status') = 'interrupted', 'F19 new session interrupts normally');
select public.abandon_focus_session(:S5);

-- DB-level backstop: even a privileged writer cannot create a second open session
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select public.start_focus_session(:S6, 'x', 600)->>'id';
reset role;
select tt.expect_error('insert into public.focus_sessions (id,user_id,started_at,planned_duration_seconds,status) values (gen_random_uuid(), ''aaaaaaaa-0000-0000-0000-00000000000a'', now(), 600, ''active'')',
                       'idx_focus_sessions_one_open_per_user');
delete from public.focus_sessions where id = :S6;

delete from public.focus_sessions;

-- =========================== PAUSE / RESUME ===================================
select public.start_focus_session(:S4, 'pause test', 600) as pstart \gset
reset role; update public.focus_sessions set started_at = started_at - interval '100 seconds' where id = :S4;
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select tt.ok((public.get_active_focus_session()->>'remaining_seconds')::int = 500, 'P1 100s elapsed -> 500s remaining, before any pause');

select public.pause_focus_session(:S4) as p1 \gset
select tt.ok((:'p1'::jsonb->>'is_paused')::boolean and (:'p1'::jsonb->>'remaining_seconds')::int = 500,
             'P2 pause freezes remaining at its current value');

-- simulate 50 real seconds passing while paused: shift EVERY absolute
-- timestamp on the row back by the same amount (started_at AND paused_at),
-- which leaves the already-elapsed focused time unchanged.
reset role;
update public.focus_sessions
   set started_at = started_at - interval '50 seconds',
       paused_at  = paused_at  - interval '50 seconds'
 where id = :S4;
select set_config('request.jwt.claim.sub', :A, false); set role authenticated;
select tt.ok((public.get_active_focus_session()->>'remaining_seconds')::int = 500,
             'P3 remaining stays frozen at 500 through a simulated 50s pause (the kill-while-paused bug)');

select tt.ok((public.pause_focus_session(:S4)->>'is_paused')::boolean
         and (public.pause_focus_session(:S4)->>'paused_seconds')::int = 0,
             'P4 pausing an already-paused session is a no-op (paused_seconds only accrues on resume)');

select public.resume_focus_session(:S4) as r1 \gset
select tt.ok(not (:'r1'::jsonb->>'is_paused')::boolean
         and (:'r1'::jsonb->>'remaining_seconds')::int = 500
         and (:'r1'::jsonb->>'paused_seconds')::int = 50,
             'P5 resume: is_paused false, remaining unchanged at 500, 50s banked in paused_seconds');
select tt.ok((public.resume_focus_session(:S4)->>'paused_seconds')::int = 50,
             'P6 resuming an already-running session is a no-op (paused_seconds does not grow again)');

select public.abandon_focus_session(:S4) as pab \gset
select tt.ok((:'pab'::jsonb->>'duration_seconds')::int = 100,
             'P7 abandon after a pause counts only actually-focused time (100s), not the 50s pause');

reset role;
drop schema tt cascade;
\echo ALL TESTS PASSED
