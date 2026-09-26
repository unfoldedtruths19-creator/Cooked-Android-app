-- ============================================================================
-- COOKED — Screen Time Schema
-- Tables: screen_time_logs, daily_summaries, ingest_errors
-- RLS: users can only read/write their own rows
-- Trigger: screen_time_logs -> daily_summaries roll-up
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- screen_time_logs
-- One row per app-usage session reported by the device.
-- ----------------------------------------------------------------------------
create table if not exists public.screen_time_logs (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  package_name      text not null,               -- raw package/bundle id, e.g. com.instagram.android
  app_name          text not null,                -- normalized readable name, e.g. Instagram
  platform          text not null check (platform in ('android', 'ios')),
  session_start     timestamptz not null,
  session_end       timestamptz not null,
  duration_seconds  integer not null check (duration_seconds >= 0),
  was_capped        boolean not null default false, -- true if we clamped an anomalous session
  raw_duration_ms   bigint,                        -- original value before normalization, kept for audit
  device_id         text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_screen_time_logs_user_day
  on public.screen_time_logs (user_id, session_start);

create index if not exists idx_screen_time_logs_user_created
  on public.screen_time_logs (user_id, created_at desc);

alter table public.screen_time_logs enable row level security;

create policy "Users can read own screen time logs"
  on public.screen_time_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own screen time logs"
  on public.screen_time_logs for insert
  with check (auth.uid() = user_id);

-- No update/delete policy on purpose — logs are append-only from the client.
-- Service role (used by the Edge Function) bypasses RLS entirely.

-- ----------------------------------------------------------------------------
-- daily_summaries
-- One row per user per calendar day. Pre-aggregated so the dashboard never
-- has to scan raw logs.
-- ----------------------------------------------------------------------------
create table if not exists public.daily_summaries (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  summary_date          date not null,
  total_seconds         integer not null default 0,
  top_app_name          text,
  top_app_seconds       integer default 0,
  app_breakdown         jsonb not null default '{}'::jsonb, -- { "Instagram": 3600, "YouTube": 1800, ... }
  session_count         integer not null default 0,
  updated_at            timestamptz not null default now(),
  unique (user_id, summary_date)
);

create index if not exists idx_daily_summaries_user_date
  on public.daily_summaries (user_id, summary_date desc);

alter table public.daily_summaries enable row level security;

create policy "Users can read own daily summaries"
  on public.daily_summaries for select
  using (auth.uid() = user_id);

-- Writes to daily_summaries only ever happen via the trigger function below,
-- which runs as SECURITY DEFINER, so no insert/update policy is granted to
-- regular users.

-- ----------------------------------------------------------------------------
-- ingest_errors
-- Anything that fails validation/normalization lands here with the raw
-- payload intact so the team can debug without losing data.
-- ----------------------------------------------------------------------------
create table if not exists public.ingest_errors (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid references auth.users(id) on delete set null,
  error_message     text not null,
  error_stage       text not null, -- 'auth' | 'validation' | 'normalization' | 'write'
  raw_payload       jsonb not null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_ingest_errors_created
  on public.ingest_errors (created_at desc);

-- No RLS select policy for regular users — this table is for the team only,
-- accessed via the service role / Supabase dashboard.
alter table public.ingest_errors enable row level security;

-- ----------------------------------------------------------------------------
-- Trigger: roll up a newly inserted log into daily_summaries
-- ----------------------------------------------------------------------------
create or replace function public.fn_update_daily_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date;
  v_breakdown jsonb;
  v_total int;
  v_count int;
  v_top_app text;
  v_top_seconds int;
begin
  v_day := (new.session_start at time zone 'utc')::date;

  -- Recompute the whole day from screen_time_logs. Simpler and safer than
  -- incrementally patching jsonb, and a day's worth of rows is small.
  select
    coalesce(sum(duration_seconds), 0),
    count(*),
    coalesce(
      jsonb_object_agg(app_name, app_total) filter (where app_name is not null),
      '{}'::jsonb
    )
  into v_total, v_count, v_breakdown
  from (
    select app_name, sum(duration_seconds) as app_total
    from public.screen_time_logs
    where user_id = new.user_id
      and (session_start at time zone 'utc')::date = v_day
    group by app_name
  ) per_app;

  select app_name, app_total into v_top_app, v_top_seconds
  from (
    select app_name, sum(duration_seconds) as app_total
    from public.screen_time_logs
    where user_id = new.user_id
      and (session_start at time zone 'utc')::date = v_day
    group by app_name
    order by app_total desc
    limit 1
  ) top;

  insert into public.daily_summaries (
    user_id, summary_date, total_seconds, top_app_name, top_app_seconds,
    app_breakdown, session_count, updated_at
  )
  values (
    new.user_id, v_day, v_total, v_top_app, coalesce(v_top_seconds, 0),
    v_breakdown, v_count, now()
  )
  on conflict (user_id, summary_date)
  do update set
    total_seconds   = excluded.total_seconds,
    top_app_name    = excluded.top_app_name,
    top_app_seconds = excluded.top_app_seconds,
    app_breakdown   = excluded.app_breakdown,
    session_count   = excluded.session_count,
    updated_at      = now();

  return new;
end;
$$;

drop trigger if exists trg_update_daily_summary on public.screen_time_logs;
create trigger trg_update_daily_summary
  after insert on public.screen_time_logs
  for each row
  execute function public.fn_update_daily_summary();
