-- Seed the topic registry, the officials' Texas House service, and the campaign pages outside
-- the main sitemaps. Safe to run again: every statement upserts.

-- Topics. Watched bills were confirmed on Texas Legislature Online; record votes come from the
-- House Journal. The 1st and 2nd called sessions of the 89th Legislature (891, 892) had hemp bills
-- that got no House record vote; they are watched for new actions only.
insert into tx_tracker.tx_topics (code, label, keywords, related_bills) values
(
  'cannabis_thc',
  'Cannabis and THC',
  array['THC', 'CBD', 'cannabis', 'cannabinoid', 'cannabinoids', 'marijuana', 'marihuana', 'hemp', 'compassionate use'],
  '[{"session":"89R","bill":"SB3"},{"session":"89R","bill":"HB46"},{"session":"89R","bill":"HB4879"},
    {"session":"891","bill":"SB5"},{"session":"892","bill":"SB6"},
    {"session":"88R","bill":"HB218"},{"session":"88R","bill":"HB1805"},{"session":"88R","bill":"HB2818"},{"session":"88R","bill":"HB4918"}]'::jsonb
),
(
  'adult_content_age_verification',
  'Adult content and age verification',
  array['age verification', 'age-verification', 'verify their age', 'verify the age', 'pornography', 'pornographic',
        'Pornhub', 'adult websites', 'adult content', 'harmful to minors', 'HB 1181', 'SB 2420', 'App Store Accountability'],
  '[{"session":"88R","bill":"HB1181"},{"session":"88R","bill":"HB18"},{"session":"89R","bill":"SB2420"},{"session":"89R","bill":"HB581"}]'::jsonb
)
on conflict (code) do update
  set label = excluded.label,
      keywords = excluded.keywords,
      related_bills = excluded.related_bills,
      updated_at = now();

-- Texas House service, from the Legislative Reference Library's "Texas Legislators: Past & Present".
insert into tx_tracker.tx_legislative_service (politician_id, chamber, legislature, district, journal_name, source_url)
select p.id, 'house', s.legislature, s.district, s.journal_name, s.source_url
from (values
  ('james-talarico', 85, '52', 'Talarico', 'https://lrl.texas.gov/legeLeaders/members/memberDisplay.cfm?memberID=5831'),
  ('james-talarico', 86, '52', 'Talarico', 'https://lrl.texas.gov/legeLeaders/members/memberDisplay.cfm?memberID=5831'),
  ('james-talarico', 87, '52', 'Talarico', 'https://lrl.texas.gov/legeLeaders/members/memberDisplay.cfm?memberID=5831'),
  ('james-talarico', 88, '50', 'Talarico', 'https://lrl.texas.gov/legeLeaders/members/memberDisplay.cfm?memberID=5831'),
  ('james-talarico', 89, '50', 'Talarico', 'https://lrl.texas.gov/legeLeaders/members/memberDisplay.cfm?memberID=5831'),
  ('gina-hinojosa', 85, '49', 'Hinojosa', 'https://lrl.texas.gov/legeLeaders/members/memberDisplay.cfm?memberID=5799'),
  ('gina-hinojosa', 86, '49', 'Hinojosa', 'https://lrl.texas.gov/legeLeaders/members/memberDisplay.cfm?memberID=5799'),
  ('gina-hinojosa', 87, '49', 'Hinojosa', 'https://lrl.texas.gov/legeLeaders/members/memberDisplay.cfm?memberID=5799'),
  ('gina-hinojosa', 88, '49', 'Hinojosa', 'https://lrl.texas.gov/legeLeaders/members/memberDisplay.cfm?memberID=5799'),
  ('gina-hinojosa', 89, '49', 'Hinojosa', 'https://lrl.texas.gov/legeLeaders/members/memberDisplay.cfm?memberID=5799'),
  ('vikki-goodwin', 86, '47', 'Goodwin', 'https://lrl.texas.gov/legeLeaders/members/memberDisplay.cfm?memberID=5830'),
  ('vikki-goodwin', 87, '47', 'Goodwin', 'https://lrl.texas.gov/legeLeaders/members/memberDisplay.cfm?memberID=5830'),
  ('vikki-goodwin', 88, '47', 'Goodwin', 'https://lrl.texas.gov/legeLeaders/members/memberDisplay.cfm?memberID=5830'),
  ('vikki-goodwin', 89, '47', 'Goodwin', 'https://lrl.texas.gov/legeLeaders/members/memberDisplay.cfm?memberID=5830')
) as s(slug, legislature, district, journal_name, source_url)
join tx_tracker.politicians p on p.slug = s.slug
on conflict (politician_id, chamber, legislature) do update
  set district = excluded.district, journal_name = excluded.journal_name, source_url = excluded.source_url;

-- Campaign pages on subdomains the main sitemaps miss.
update tx_tracker.politicians
  set campaign_watch_urls = array['https://act.ginafortexas.com/signup/ads_ms_20260914_EA_FB_THCPetition/']
  where slug = 'gina-hinojosa';
update tx_tracker.politicians
  set campaign_watch_urls = array['https://act.vikkigoodwin.com/hemp/']
  where slug = 'vikki-goodwin';
