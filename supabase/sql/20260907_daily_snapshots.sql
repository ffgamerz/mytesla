-- ==========================================
-- Daily Snapshot: tesla_daily_snapshots
-- Track daily odometer / battery / range for mileage & degradation charts
-- ==========================================

create table if not exists public.tesla_daily_snapshots (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    snapshot_date date not null,
    odometer numeric,
    battery_level integer,
    battery_range numeric,      -- rated range (km) at time of snapshot
    estimated_range numeric,    -- estimated range (km)
    is_charging boolean default false,
    charge_power numeric,
    model text,
    trim text,
    inside_temp numeric,
    outside_temp numeric,
    latitude numeric,
    longitude numeric,
    created_at timestamptz default now(),
    unique (user_id, snapshot_date)
);

alter table public.tesla_daily_snapshots enable row level security;

drop policy if exists "Users can view own snapshots" on public.tesla_daily_snapshots;
create policy "Users can view own snapshots"
    on public.tesla_daily_snapshots for select
    using (auth.uid() = user_id);

drop policy if exists "Users can insert own snapshots" on public.tesla_daily_snapshots;
create policy "Users can insert own snapshots"
    on public.tesla_daily_snapshots for insert
    with check (auth.uid() = user_id);

-- Index for fast range queries
create index if not exists idx_daily_snapshots_user_date
    on public.tesla_daily_snapshots (user_id, snapshot_date desc);

-- ==========================================
-- Snapshot time per user + flexible cron
-- ==========================================
alter table public.tesla_user_settings
    add column if not exists snapshot_time text default '02:30';

-- ==========================================
-- Cron: daily pull at the user's configured snapshot_time (MYT).
-- Runs ONCE daily. When the time is changed in Settings, the app calls
-- set_snapshot_cron() via RPC to reschedule automatically.
-- NOTE: Vault extension unavailable on this project, so the service_role key
-- is inlined inside the function. Replace SERVICE_ROLE_KEY_ANDA with your real
-- key (Project Settings -> API -> service_role) BEFORE running.
-- ==========================================

-- Cleanup: remove ALL tesla-daily-snapshot jobs (incl. duplicates from earlier attempts)
do $$
declare j text;
begin
  for j in select jobname from cron.job where jobname = 'tesla-daily-snapshot' loop
    perform cron.unschedule(j);
  end loop;
end $$;

-- Function to (re)schedule the daily cron at a given MYT time ('HH:MM')
create or replace function public.set_snapshot_cron(p_time text)
returns void
language plpgsql
security definer
as $fn$
declare
  h int;
  m int;
  utc_m int;
  utc_h int;
begin
  h := split_part(p_time, ':', 1)::int;
  m := split_part(p_time, ':', 2)::int;
  -- Convert MYT (UTC+8) to UTC for pg_cron (handles midnight wrap)
  utc_h := (h - 8 + 24) % 24;
  utc_m := m;

  perform cron.unschedule('tesla-daily-snapshot')
  where exists (select 1 from cron.job where jobname = 'tesla-daily-snapshot');

  perform cron.schedule(
      'tesla-daily-snapshot',
      format('%s %s * * *', utc_m, utc_h),
      $cmd$
      select net.http_post(
          url := 'https://wvpqllnpataysjqufumy.supabase.co/functions/v1/tesla-proxy/daily-snapshot',
          headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer SERVICE_ROLE_KEY_ANDA'
          ),
          body := '{}'::jsonb
      );
      $cmd$
  );
end;
$fn$;

revoke all on function public.set_snapshot_cron(text) from public;
grant execute on function public.set_snapshot_cron(text) to service_role, authenticated;

-- Initial schedule: 02:30 MYT
select public.set_snapshot_cron('02:30');

-- Optional: manual one-off trigger (after edge function is deployed).
-- Replace SERVICE_ROLE_KEY_ANDA with your real service_role key.
select net.http_post(
    url := 'https://wvpqllnpataysjqufumy.supabase.co/functions/v1/tesla-proxy/daily-snapshot',
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer SERVICE_ROLE_KEY_ANDA'
    ),
    body := '{}'::jsonb
);
