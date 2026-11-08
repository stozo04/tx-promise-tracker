-- Texas House seats are per district. Statewide offices leave this empty.
-- The site shows "District 112" in the header switch and "Texas House of Representatives, District 112"
-- on the official's page when it is set. Office code for a state representative is 'tx_house'.
alter table tx_tracker.politicians
  add column if not exists district text;
comment on column tx_tracker.politicians.district is 'Legislative district number as text, e.g. ''112''. Null for statewide offices.';
