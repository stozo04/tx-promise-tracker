-- Closes the gaps in SYNC-CHECKLIST.md: IDs instead of last names, one run per calendar day with a
-- nightly fill-in, bookkeeping for the new Texas sources, and the Texas Ethics Commission tables.

-- D1. Each official's IDs at the sources. Sync matches on these, never on a last name.
alter table tx_tracker.politicians
  add column if not exists fec_candidate_id text,
  add column if not exists bioguide_id text,
  add column if not exists lis_member_id text,
  add column if not exists tec_filer_id text;
comment on column tx_tracker.politicians.fec_candidate_id is 'FEC candidate ID (fec.gov/data/candidate/<id>).';
comment on column tx_tracker.politicians.bioguide_id is 'Congress.gov member ID, assigned when the member is sworn in.';
comment on column tx_tracker.politicians.lis_member_id is 'U.S. Senate LIS member ID, the <lis_member_id> in senate.gov roll-call XML.';
comment on column tx_tracker.politicians.tec_filer_id is 'Texas Ethics Commission filer ID (filerIdent in the TEC campaign finance export).';

-- From fec.gov candidate S6TX00479 and the TEC filer list (filers.csv in TEC_CF_CSV.zip), 2026-11-09.
update tx_tracker.politicians set fec_candidate_id = 'S6TX00479' where slug = 'james-talarico';
update tx_tracker.politicians set tec_filer_id = '00080440' where slug = 'gina-hinojosa';
update tx_tracker.politicians set tec_filer_id = '00081436' where slug = 'vikki-goodwin';
update tx_tracker.politicians set tec_filer_id = '00089964' where slug = 'zach-herbert';

-- A2. The member code Texas Legislature Online uses in its Bills by Author reports. It is the same
-- in every session (capitol.texas.gov/Reports/BillsBy.aspx, checked 2026-11-09).
alter table tx_tracker.tx_legislative_service add column if not exists tlo_member_code text;
update tx_tracker.tx_legislative_service s set tlo_member_code = c.code
from tx_tracker.politicians p,
  (values ('james-talarico', 'A3685'), ('vikki-goodwin', 'A3820'), ('gina-hinojosa', 'A3210')) as c(slug, code)
where s.politician_id = p.id and p.slug = c.slug and s.chamber = 'house';

-- Items a source has read that hold nothing new (a journal day, a roll call the official is not
-- on, a finished month of the governor's news archive), so they are not read again.
create table if not exists tx_tracker.tx_checked_items (
  source text not null,
  item text not null,
  checked_at timestamptz not null default now(),
  primary key (source, item)
);

-- B1. Texas Ethics Commission campaign finance, read from the TEC's daily bulk export.
create table if not exists tx_tracker.tx_tec_reports (
  report_id bigint primary key,
  politician_id uuid references tx_tracker.politicians(id),
  filer_ident text not null,
  report_type text,
  received_on date not null,
  period_start date,
  period_end date,
  total_contrib numeric,
  unitemized_contrib numeric,
  cash_on_hand numeric,
  info_only boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists tx_tracker.tx_tec_files (
  name text primary key,
  crc text not null,
  first_report_id bigint,
  read_crc text,
  updated_at timestamptz not null default now()
);
create table if not exists tx_tracker.tx_tec_report_parts (
  file_name text not null,
  report_id bigint not null,
  filer_ident text not null,
  rows integer not null,
  itemized_total numeric not null,
  in_state_total numeric not null,
  employers jsonb not null default '{}',
  top_gifts jsonb not null default '[]',
  primary key (file_name, report_id, filer_ident)
);

alter table tx_tracker.tx_checked_items enable row level security;
alter table tx_tracker.tx_tec_reports enable row level security;
alter table tx_tracker.tx_tec_files enable row level security;
alter table tx_tracker.tx_tec_report_parts enable row level security;
revoke all on tx_tracker.tx_checked_items, tx_tracker.tx_tec_reports, tx_tracker.tx_tec_files,
  tx_tracker.tx_tec_report_parts from anon, authenticated;
grant all on tx_tracker.tx_checked_items, tx_tracker.tx_tec_reports, tx_tracker.tx_tec_files,
  tx_tracker.tx_tec_report_parts to service_role;

-- C1. Who started each run: the Sync button or the nightly schedule.
alter table tx_tracker.ingest_runs add column if not exists triggered_by text not null default 'button';
alter table tx_tracker.ingest_runs drop constraint if exists ingest_runs_triggered_by_check;
alter table tx_tracker.ingest_runs add constraint ingest_runs_triggered_by_check
  check (triggered_by in ('button', 'schedule'));

-- C1. One run per calendar day in Central time, for the whole site. The button can start it any
-- time that day; at 11:30 pm CT the nightly job starts it if nobody did.
drop function if exists tx_tracker.tx_claim_sync(interval);
create or replace function tx_tracker.tx_claim_sync(p_trigger text default 'button')
returns table (run_id uuid, last_started_at timestamptz, next_allowed_at timestamptz)
language plpgsql
security definer
set search_path = tx_tracker, pg_temp
as $$
declare
  last_start timestamptz;
  day_start timestamptz := date_trunc('day', now() at time zone 'America/Chicago') at time zone 'America/Chicago';
  next_day timestamptz := (date_trunc('day', now() at time zone 'America/Chicago') + interval '1 day') at time zone 'America/Chicago';
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('tx_tracker.tx_claim_sync'));
  select max(started_at) into last_start from tx_tracker.ingest_runs;
  if last_start is not null and last_start >= day_start then
    return query select null::uuid, last_start, next_day;
    return;
  end if;
  insert into tx_tracker.ingest_runs (source_type, triggered_by, notes)
  values ('tx_sync', case when p_trigger = 'schedule' then 'schedule' else 'button' end,
          case when p_trigger = 'schedule' then 'Started by the nightly schedule' else 'Started by the public Sync button' end)
  returning id into new_id;
  return query select new_id, now(), next_day;
end;
$$;
revoke all on function tx_tracker.tx_claim_sync(text) from public, anon, authenticated;
grant execute on function tx_tracker.tx_claim_sync(text) to service_role;

-- The key that signs Sync's calls to its own stages. Generated here, so it never leaves the database.
insert into tx_tracker.tx_private_settings (key, value)
values ('sync_stage_key', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- C1. The nightly fill-in. pg_cron runs in UTC, so the job fires at 04:30 and 05:30 UTC and this
-- function acts only when it is 11 pm in Central time (04:30 UTC in daylight time, 05:30 UTC in
-- standard time). It starts a run only if none started since midnight CT. The function's address
-- is read from tx_private_settings.sync_function_url, so no project address is in the repo.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function tx_tracker.tx_nightly_sync(p_force boolean default false)
returns text
language plpgsql
security definer
set search_path = tx_tracker, pg_temp
as $$
declare
  local_now timestamp := now() at time zone 'America/Chicago';
  day_start timestamptz := date_trunc('day', now() at time zone 'America/Chicago') at time zone 'America/Chicago';
  url text;
begin
  if not p_force and extract(hour from local_now) <> 23 then
    return 'skipped: not 11 pm in Central time';
  end if;
  if exists (select 1 from tx_tracker.ingest_runs where started_at >= day_start) then
    return 'skipped: a run already started today';
  end if;
  select value into url from tx_tracker.tx_private_settings where key = 'sync_function_url';
  if url is null then
    raise exception 'tx_private_settings.sync_function_url is not set';
  end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('trigger', 'schedule'),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  return 'started';
end;
$$;
revoke all on function tx_tracker.tx_nightly_sync(boolean) from public, anon, authenticated;
grant execute on function tx_tracker.tx_nightly_sync(boolean) to service_role;

select cron.unschedule('tx_nightly_sync') where exists (select 1 from cron.job where jobname = 'tx_nightly_sync');
select cron.schedule('tx_nightly_sync', '30 4,5 * * *', $$select tx_tracker.tx_nightly_sync()$$);
