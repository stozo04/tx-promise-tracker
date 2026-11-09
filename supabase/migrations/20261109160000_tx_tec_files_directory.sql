-- B1 follow-up. The TEC CDN refuses byte ranges after a burst of requests, so Sync keeps the zip's
-- directory here (read once per run) and picks contribs files by the day each report was received
-- (files run in arrival order; report IDs do not). fetched_at counts requests per run.
alter table tx_tracker.tx_tec_files
  add column if not exists "offset" bigint,
  add column if not exists compressed_size bigint,
  add column if not exists size bigint,
  add column if not exists method integer,
  add column if not exists first_received date,
  add column if not exists fetched_at timestamptz,
  drop column if exists first_report_id;
