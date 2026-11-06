-- Promise vs. Delivered, phase 2.
-- Official records (votes, signings, vetoes, sponsorships), upcoming events,
-- campaign contributions, community votes, and a once-a-day sync claim.
-- Everything new is prefixed tx_. Public roles can read records and vote
-- totals. Only service_role (Edge Functions) can write.

-- Official actions copied from primary public records.
create table tx_tracker.tx_record_actions (
  id uuid primary key default gen_random_uuid(),
  politician_id uuid not null references tx_tracker.politicians(id),
  kind text not null check (kind in (
    'vote', 'signed', 'vetoed', 'filed_without_signature',
    'sponsored', 'cosponsored', 'executive_order'
  )),
  bill_id text,
  title text not null,
  what_it_does text,
  position text check (position is null or position in ('yea', 'nay', 'present', 'not_voting')),
  result text,
  acted_on date not null,
  source_name text not null,
  source_url text not null,
  -- Only set when the action really bears on a promise. Null means "not tied", not "unrelated".
  promise_id uuid references tx_tracker.promises(id),
  external_id text not null unique,
  created_at timestamptz not null default now()
);
create index tx_record_actions_politician_idx on tx_tracker.tx_record_actions (politician_id, acted_on desc);

-- Scheduled votes, hearings, deadlines and sessions.
create table tx_tracker.tx_upcoming_events (
  id uuid primary key default gen_random_uuid(),
  politician_id uuid not null references tx_tracker.politicians(id),
  title text not null,
  starts_on date,
  when_label text,
  source_name text not null,
  source_url text not null,
  external_id text not null unique,
  created_at timestamptz not null default now()
);
create index tx_upcoming_events_politician_idx on tx_tracker.tx_upcoming_events (politician_id, starts_on);

-- Itemized contributions, each tied to the filing that proves the name and the amount.
create table tx_tracker.tx_contributions (
  id uuid primary key default gen_random_uuid(),
  politician_id uuid not null references tx_tracker.politicians(id),
  contributor_name text not null,
  contributor_city text,
  contributor_state text,
  contributor_employer text,
  amount numeric(12, 2) not null,
  contributed_on date,
  filing_id text,
  source_name text not null,
  source_url text not null,
  external_id text not null unique,
  created_at timestamptz not null default now()
);
create index tx_contributions_politician_idx on tx_tracker.tx_contributions (politician_id, amount desc);

-- Community votes. One vote per IP per item. The IP is never stored, only a
-- salted SHA-256 hash made inside the Edge Function. Raw rows are private.
create table tx_tracker.tx_community_votes (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('status_update', 'record_action')),
  item_id uuid not null,
  choice text not null check (choice in ('support', 'oppose')),
  ip_hash text not null,
  created_at timestamptz not null default now(),
  unique (item_type, item_id, ip_hash)
);

-- Public totals only. Runs as the view owner so it can count private rows
-- without exposing ip_hash.
create view tx_tracker.tx_community_vote_totals
with (security_invoker = false) as
select
  item_type,
  item_id,
  count(*) filter (where choice = 'support')::int as support,
  count(*) filter (where choice = 'oppose')::int as oppose
from tx_tracker.tx_community_votes
group by item_type, item_id;

-- RLS and grants
alter table tx_tracker.tx_record_actions enable row level security;
alter table tx_tracker.tx_upcoming_events enable row level security;
alter table tx_tracker.tx_contributions enable row level security;
alter table tx_tracker.tx_community_votes enable row level security;

create policy tx_record_actions_select_public on tx_tracker.tx_record_actions
  for select to anon, authenticated using (true);
create policy tx_upcoming_events_select_public on tx_tracker.tx_upcoming_events
  for select to anon, authenticated using (true);
create policy tx_contributions_select_public on tx_tracker.tx_contributions
  for select to anon, authenticated using (true);
-- No public policy on tx_community_votes: anon and authenticated cannot read or write raw votes.

grant select on tx_tracker.tx_record_actions, tx_tracker.tx_upcoming_events, tx_tracker.tx_contributions
  to anon, authenticated;
grant select on tx_tracker.tx_community_vote_totals to anon, authenticated;
revoke all on tx_tracker.tx_community_votes from anon, authenticated;
grant all on tx_tracker.tx_record_actions, tx_tracker.tx_upcoming_events, tx_tracker.tx_contributions,
  tx_tracker.tx_community_votes to service_role;
grant select on tx_tracker.tx_community_vote_totals to service_role;

-- Claim the once-a-day sync. Serialized with an advisory lock so two
-- simultaneous requests cannot both start a sync. Returns the new run id,
-- or null plus the time the next sync is allowed.
create or replace function tx_tracker.tx_claim_sync(cooldown interval default interval '24 hours')
returns table (run_id uuid, last_started_at timestamptz, next_allowed_at timestamptz)
language plpgsql
security definer
set search_path = tx_tracker, pg_temp
as $$
declare
  last_start timestamptz;
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('tx_tracker.tx_claim_sync'));
  select max(started_at) into last_start from tx_tracker.ingest_runs;
  if last_start is not null and last_start > now() - cooldown then
    return query select null::uuid, last_start, last_start + cooldown;
    return;
  end if;
  insert into tx_tracker.ingest_runs (source_type, notes)
  values ('tx_sync', 'Started by the public Sync button')
  returning id into new_id;
  return query select new_id, now(), now() + cooldown;
end;
$$;
revoke all on function tx_tracker.tx_claim_sync(interval) from public, anon, authenticated;
grant execute on function tx_tracker.tx_claim_sync(interval) to service_role;

-- Private settings only Edge Functions can read. Holds the salt for hashing
-- voter IPs, generated here so the value never leaves the database.
create table tx_tracker.tx_private_settings (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table tx_tracker.tx_private_settings enable row level security;
revoke all on tx_tracker.tx_private_settings from anon, authenticated;
grant select on tx_tracker.tx_private_settings to service_role;
insert into tx_tracker.tx_private_settings (key, value)
values ('ip_hash_salt', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
