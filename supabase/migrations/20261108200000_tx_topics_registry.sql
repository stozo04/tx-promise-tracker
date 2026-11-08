-- One global Sync that checks every topic for every official.
--
-- tx_topics          The topic registry. Adding an active row is all it takes for the next Sync
--                    to check a new topic across every official's campaign pages and watched bills.
-- tx_topic_findings  A review queue. Sync writes keyword matches and bill actions here. Findings
--                    are never published as promises automatically: a person confirms the
--                    verbatim quote and the primary source first.
-- tx_watched_pages   One row per campaign page Sync reads, with a content hash so only changed
--                    pages are matched again. The oldest-checked pages go first, which is also the
--                    resume cursor when a run stops at its page cap.
-- tx_legislative_service
--                    Which legislature and chamber each official served in before the office now
--                    tracked, and the name the journal prints for them. Sync uses it to read their
--                    record votes on watched bills.
-- tx_record_actions.office_context
--                    Set for votes and bills from an earlier office, e.g.
--                    "Texas House, District 47 (88th Legislature)". Null means the office tracked now.

create table tx_tracker.tx_topics (
  code text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  -- Whole-word matches. An all-caps keyword (an acronym like THC) matches case-sensitively,
  -- so it does not match inside another word. Everything else ignores case.
  keywords text[] not null default '{}',
  -- Bills Sync watches for this topic: [{"session": "89R", "bill": "SB3"}, ...]
  related_bills jsonb not null default '[]'::jsonb check (jsonb_typeof(related_bills) = 'array'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table tx_tracker.tx_topics is 'Topic registry. Labels shown on the site come from here first. Active topics are checked by every Sync.';

create table tx_tracker.tx_topic_findings (
  id uuid primary key default gen_random_uuid(),
  -- Null for bill actions, which are not about one official.
  politician_id uuid references tx_tracker.politicians(id),
  topic text not null references tx_tracker.tx_topics(code),
  kind text not null default 'page' check (kind in ('page', 'post', 'bill_action')),
  url text not null,
  excerpt text not null,
  keyword text not null,
  content_hash text not null,
  found_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'promoted', 'dismissed')),
  reviewed_at timestamptz,
  -- Set when a person turns the finding into a promise.
  promise_id uuid references tx_tracker.promises(id),
  review_note text,
  unique nulls not distinct (politician_id, topic, url, content_hash)
);
create index tx_topic_findings_status_idx on tx_tracker.tx_topic_findings (status, found_at desc);
comment on table tx_tracker.tx_topic_findings is 'Review queue. Never published as promises automatically.';

create table tx_tracker.tx_watched_pages (
  url text primary key,
  politician_id uuid not null references tx_tracker.politicians(id),
  origin text not null default 'sitemap' check (origin in ('sitemap', 'extra')),
  content_hash text,
  http_status int,
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  created_at timestamptz not null default now()
);
create index tx_watched_pages_cursor_idx on tx_tracker.tx_watched_pages (last_checked_at nulls first);

create table tx_tracker.tx_legislative_service (
  politician_id uuid not null references tx_tracker.politicians(id),
  chamber text not null check (chamber in ('house', 'senate')),
  legislature int not null,
  district text not null,
  -- The name as the journal prints it in record-vote lists, e.g. "Goodwin" or "Gonzalez, J.".
  journal_name text not null,
  source_url text not null,
  primary key (politician_id, chamber, legislature)
);

-- Extra campaign pages Sync should read that the main sitemap misses, such as petition pages
-- on a campaign subdomain.
alter table tx_tracker.politicians
  add column if not exists campaign_watch_urls text[] not null default '{}';
comment on column tx_tracker.politicians.campaign_watch_urls is 'Campaign pages outside the main sitemap (e.g. petition subdomains) that Sync reads for topics.';

alter table tx_tracker.tx_record_actions
  add column if not exists office_context text;
comment on column tx_tracker.tx_record_actions.office_context is 'Set for actions from an earlier office, e.g. "Texas House, District 47 (88th Legislature)". Null means the office tracked now.';

-- House journals list members who were absent separately from "Present, not voting".
alter table tx_tracker.tx_record_actions drop constraint if exists tx_record_actions_position_check;
alter table tx_tracker.tx_record_actions add constraint tx_record_actions_position_check
  check (position is null or position in ('yea', 'nay', 'present', 'not_voting', 'absent'));

-- RLS and grants. The registry, the review queue and legislative service are public records.
-- Watched pages are Sync's own bookkeeping.
alter table tx_tracker.tx_topics enable row level security;
alter table tx_tracker.tx_topic_findings enable row level security;
alter table tx_tracker.tx_watched_pages enable row level security;
alter table tx_tracker.tx_legislative_service enable row level security;

create policy tx_topics_select_public on tx_tracker.tx_topics
  for select to anon, authenticated using (true);
create policy tx_topic_findings_select_public on tx_tracker.tx_topic_findings
  for select to anon, authenticated using (true);
create policy tx_legislative_service_select_public on tx_tracker.tx_legislative_service
  for select to anon, authenticated using (true);

grant select on tx_tracker.tx_topics, tx_tracker.tx_topic_findings, tx_tracker.tx_legislative_service
  to anon, authenticated;
revoke all on tx_tracker.tx_watched_pages from anon, authenticated;
grant all on tx_tracker.tx_topics, tx_tracker.tx_topic_findings, tx_tracker.tx_watched_pages,
  tx_tracker.tx_legislative_service to service_role;
