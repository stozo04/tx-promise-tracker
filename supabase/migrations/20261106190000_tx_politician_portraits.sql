-- Official or press-kit portraits. Shown only with a credit and a source link.
alter table tx_tracker.politicians
  add column if not exists portrait_url text,
  add column if not exists portrait_credit text,
  add column if not exists portrait_source_url text;
comment on column tx_tracker.politicians.portrait_url is 'Public URL of the portrait, ideally a copy in the tx-campaign-archives storage bucket.';
comment on column tx_tracker.politicians.portrait_credit is 'Who to credit, as the source asks, e.g. "Official portrait, U.S. Senate".';
comment on column tx_tracker.politicians.portrait_source_url is 'The page the portrait was taken from, so the license can be checked.';
