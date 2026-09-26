-- =====================================================================
-- COOKED — Screen Time ingestion schema
-- Tables: screen_time_logs, daily_summaries, ingest_errors
-- Includes RLS policies + trigger to keep daily_summaries pre-aggregated
-- =====================================================================
-- NOTE: restored VERBATIM from supabase_migrations.schema_migrations on the
-- remote (version 0001). Do not edit: it must match what actually ran.

-- ---------------------------------------------------------------------
-- 1. screen_time_logs — one row per app session reported by the device
-- ---------------------------------------------------------------------
create table if not exists public.screen_time_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  platform text not null check (platform in ('android', 'ios')),
  package_name text not null,          -- raw, e.g. com.instagram.android
  app_name text not null,              -- normalized, e.g. "Instagram"
  session_start timestamptz not null,
  session_end timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  was_capped boolean not null default false, -- true if we clamped an anomalous session
  raw_duration_ms bigint,              -- original value before normalization, kept for audit
  log_date date generated always as ((session_start at time zone 'utc')::date) stored,
  created_at timestamptz not null default now()
);

create index if not exists idx_screen_time_logs_user_date
  on public.screen_time_logs (user_id, log_date);

create index if not exists idx_screen_time_logs_user_created
  on public.screen_time_logs (user_id, created_at desc);

-- Prevent exact duplicate ingestion (same device replaying the same session)
create unique index if not exists uq_screen_time_logs_dedupe
  on public.screen_time_logs (user_id, device_id, package_name, session_start, session_end);

alter table public.screen_time_logs enable row level security;

create policy "screen_time_logs_select_own"
  on public.screen_time_logs for select
  using (auth.uid() = user_id);

create policy "screen_time_logs_insert_own"
  on public.screen_time_logs for insert
  with check (auth.uid() = user_id);

-- No update/delete policies on purpose — logs are append-only from the client.
-- Corrections happen server-side (service role) only.


-- ---------------------------------------------------------------------
-- 2. daily_summaries — pre-aggregated per user/day, cheap for dashboard
-- ---------------------------------------------------------------------
create table if not exists public.daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null,
  total_seconds integer not null default 0,
  top_app_name text,
  top_app_seconds integer,
  app_breakdown jsonb not null default '{}'::jsonb, -- { "Instagram": 3600, "YouTube": 1800, ... }
  session_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create index if not exists idx_daily_summaries_user_date
  on public.daily_summaries (user_id, log_date desc);

alter table public.daily_summaries enable row level security;

create policy "daily_summaries_select_own"
  on public.daily_summaries for select
  using (auth.uid() = user_id);

-- No client insert/update policies — this table is written only by the
-- trigger function below (SECURITY DEFINER), never directly by users.


-- ---------------------------------------------------------------------
-- 3. ingest_errors — dead-letter table, raw payload preserved
-- ---------------------------------------------------------------------
create table if not exists public.ingest_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,                 -- nullable: auth may have failed before we knew the user
  device_id text,
  error_reason text not null,   -- e.g. "invalid_payload", "auth_failed", "anomalous_session"
  error_detail text,
  raw_payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ingest_errors_created on public.ingest_errors (created_at desc);

alter table public.ingest_errors enable row level security;

-- Errors are written by the Edge Function using the service role key,
-- which bypasses RLS. No client-facing policies are defined, so this
-- table is invisible to normal users (including its rows' own owner) —
-- it's an internal debugging table for the team via the Supabase dashboard
-- or service-role tooling only.


-- ---------------------------------------------------------------------
-- 4. Trigger — keep daily_summaries in sync whenever a log is inserted
-- ---------------------------------------------------------------------
create or replace function public.fn_update_daily_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_seconds integer;
  v_session_count integer;
  v_breakdown jsonb;
  v_top_app text;
  v_top_seconds integer;
begin
  -- Recompute the whole day's aggregate from screen_time_logs.
  -- Simpler and safer than incrementing counters, and the per-user/day
  -- log volume is small enough that this stays cheap.
  select
    coalesce(sum(duration_seconds), 0),
    count(*),
    coalesce(jsonb_object_agg(app_name, app_total) filter (where app_name is not null), '{}'::jsonb)
  into v_total_seconds, v_session_count, v_breakdown
  from (
    select app_name, sum(duration_seconds) as app_total
    from public.screen_time_logs
    where user_id = new.user_id and log_date = new.log_date
    group by app_name
  ) per_app;

  select app_name, app_total
  into v_top_app, v_top_seconds
  from (
    select app_name, sum(duration_seconds) as app_total
    from public.screen_time_logs
    where user_id = new.user_id and log_date = new.log_date
    group by app_name
    order by app_total desc
    limit 1
  ) top;

  insert into public.daily_summaries (
    user_id, log_date, total_seconds, top_app_name, top_app_seconds,
    app_breakdown, session_count, updated_at
  )
  values (
    new.user_id, new.log_date, v_total_seconds, v_top_app, v_top_seconds,
    v_breakdown, v_session_count, now()
  )
  on conflict (user_id, log_date)
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

-- Note: SECURITY DEFINER is required here because normal users have no
-- insert/update policy on daily_summaries. The function runs as its
-- owner (the table owner / migration role), so it can write on the
-- user's behalf while still being triggered by the user's own insert.
