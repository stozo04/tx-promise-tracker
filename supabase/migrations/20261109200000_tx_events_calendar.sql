-- The Events calendar: upcoming session days, floor calendars, committee hearings, legal deadlines,
-- and public appearances, each cited to the primary source that announced it (or, for a deadline the
-- law sets, to the law). Sync fills these from the sources in supabase/functions/tx_sync/events*.ts.

-- 1. tx_upcoming_events gets the fields an event page needs. The table is kept (it was empty).
alter table tx_tracker.tx_upcoming_events
  add column if not exists kind text,
  add column if not exists ends_on date,
  add column if not exists starts_at timestamptz,
  add column if not exists time_zone text not null default 'America/Chicago',
  add column if not exists location text,
  add column if not exists details text,
  add column if not exists body text,
  add column if not exists legal_basis text,
  add column if not exists legal_url text,
  add column if not exists computed_from text,
  add column if not exists event_key text,
  add column if not exists is_campaign boolean not null default false,
  add column if not exists bills text[] not null default '{}',
  add column if not exists status text not null default 'scheduled',
  add column if not exists updated_at timestamptz;

-- Nothing was stored before, so every row has a kind from here on.
update tx_tracker.tx_upcoming_events set kind = 'session_day' where kind is null;
alter table tx_tracker.tx_upcoming_events alter column kind set not null;

alter table tx_tracker.tx_upcoming_events drop constraint if exists tx_upcoming_events_kind_check;
alter table tx_tracker.tx_upcoming_events add constraint tx_upcoming_events_kind_check
  check (kind in ('session_day', 'floor_vote', 'committee_hearing', 'deadline', 'appearance'));
alter table tx_tracker.tx_upcoming_events drop constraint if exists tx_upcoming_events_status_check;
alter table tx_tracker.tx_upcoming_events add constraint tx_upcoming_events_status_check
  check (status in ('scheduled', 'changed', 'cancelled', 'held'));

-- external_id is already unique (tx_upcoming_events_external_id_key). Index the calendar's range reads.
create index if not exists tx_upcoming_events_starts_on_idx on tx_tracker.tx_upcoming_events (starts_on);
create index if not exists tx_upcoming_events_event_key_idx on tx_tracker.tx_upcoming_events (event_key);

comment on column tx_tracker.tx_upcoming_events.kind is 'session_day, floor_vote, committee_hearing, deadline, or appearance.';
comment on column tx_tracker.tx_upcoming_events.starts_at is 'Null when the source gives no time. Never guessed.';
comment on column tx_tracker.tx_upcoming_events.details is 'The source''s own description or agenda, verbatim or a neutral summary. Never commentary.';
comment on column tx_tracker.tx_upcoming_events.legal_basis is 'For a date the law sets: the citation, e.g. "Tex. Const. art. 4, §14".';
comment on column tx_tracker.tx_upcoming_events.legal_url is 'For a date the law sets: the law''s text on statutes.capitol.texas.gov or senate.gov.';
comment on column tx_tracker.tx_upcoming_events.computed_from is 'For a computed date: the date it was computed from and why.';
comment on column tx_tracker.tx_upcoming_events.event_key is 'The same for every official''s row of one event (external_id without the official).';
comment on column tx_tracker.tx_upcoming_events.is_campaign is 'True for a campaign event from a campaign site. Shown as a campaign event.';
comment on column tx_tracker.tx_upcoming_events.status is 'scheduled, changed (time, place or agenda changed since first seen), cancelled (only when the source says so), or held.';

-- 2. Committee membership, copied from the primary source (TLO member pages, senate.gov member data).
-- Sync stores it; it is never guessed. Hearings are matched to an official through this table.
create table if not exists tx_tracker.tx_committee_memberships (
  politician_id uuid not null references tx_tracker.politicians(id),
  body text not null check (body in ('tx_house', 'tx_senate', 'us_senate')),
  session text not null,
  committee_code text not null,
  committee_name text not null,
  source_url text not null,
  checked_at timestamptz not null default now(),
  primary key (politician_id, body, session, committee_code)
);
alter table tx_tracker.tx_committee_memberships enable row level security;
drop policy if exists tx_committee_memberships_select_public on tx_tracker.tx_committee_memberships;
create policy tx_committee_memberships_select_public on tx_tracker.tx_committee_memberships
  for select to anon, authenticated using (true);
grant select on tx_tracker.tx_committee_memberships to anon, authenticated;
grant all on tx_tracker.tx_committee_memberships to service_role;

-- 3. Each official's campaign events page, as linked from their own campaign site's menu
-- (checked 2026-11-09). Sync reads only this page for public appearances.
alter table tx_tracker.politicians add column if not exists campaign_events_url text;
update tx_tracker.politicians p set campaign_events_url = v.url
from (values
  ('vikki-goodwin', 'https://www.vikkigoodwin.com/events'),
  ('gina-hinojosa', 'https://www.mobilize.us/ginahinojosafortexasgovernor/'),
  ('james-talarico', 'https://www.mobilize.us/talaricofortexas/'),
  ('zach-herbert', 'https://www.mobilize.us/zach4texas/')
) as v(slug, url)
where p.slug = v.slug and p.campaign_events_url is null;
