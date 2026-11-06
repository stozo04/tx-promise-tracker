-- Totals for one campaign cycle, copied from the filer's official summary.
create table tx_tracker.tx_contribution_summaries (
  id uuid primary key default gen_random_uuid(),
  politician_id uuid not null references tx_tracker.politicians(id),
  cycle int not null,
  receipts numeric(14, 2),
  individual_unitemized numeric(14, 2),
  individual_itemized numeric(14, 2),
  -- Itemized individual dollars with a state on file, and the Texas part of them.
  state_itemized_total numeric(14, 2),
  in_state_itemized numeric(14, 2),
  top_employers jsonb not null default '[]'::jsonb,
  coverage_end_date date,
  source_name text not null,
  source_url text not null,
  updated_at timestamptz not null default now(),
  unique (politician_id, cycle)
);
alter table tx_tracker.tx_contribution_summaries enable row level security;
create policy tx_contribution_summaries_select_public on tx_tracker.tx_contribution_summaries
  for select to anon, authenticated using (true);
grant select on tx_tracker.tx_contribution_summaries to anon, authenticated;
grant all on tx_tracker.tx_contribution_summaries to service_role;
