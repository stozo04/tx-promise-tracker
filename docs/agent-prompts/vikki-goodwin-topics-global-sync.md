# Agent prompt: add Lt. Governor-elect Vikki Goodwin, research two topics for every official, and make Sync check topics for everyone

Copy everything below the line into a new agent session started in this repo.

---

You are working in the Promise vs. Delivered repo (`tx-promise-tracker`), a neutral public ledger of what newly elected Texas officials promised and what the public record shows they did. You have three jobs. Do them in order, in **one new branch** cut from the latest `main` (PR #6, which added Texas House District 112, must already be merged; check `git log origin/main` for "Add Texas House District 112").

1. Add **Vikki Goodwin, Lieutenant Governor-elect of Texas**, as a fully tracked official, built the same way as the three officials already on the site.
2. Research two topics for **every** tracked official (Talarico, Hinojosa, Herbert, Goodwin) and capture **each individual pledge** with a primary source: **Cannabis and THC**, and **adult websites and online age verification** (the law that led Pornhub and other sites to block Texas).
3. Make **Sync** check those topics (and any topic added later) for **all officials in one run**, so nobody has to think about syncing per candidate.

Do your own research. The facts listed here are leads to verify, not evidence.

## Read first

- `AGENTS.md`: the project rules. They are binding. The ones that matter most here:
  - Every promise, action, vote and dollar links to a **primary source**: the campaign's own site or posts, Texas Legislature Online, the House and Senate Journals, Congress.gov, the FEC, the Office of the Governor, or the Texas Ethics Commission. **News stories are never evidence.** You may use news to find leads, then confirm in a primary source.
  - Never invent or estimate. If something is not found, say "Not loaded yet" or record nothing.
  - `pending` means not scored yet, never "failed".
  - Neutral copy everywhere: describe the record, not the people, parties or policies. **No election results or vote totals on the site.**
  - UI rules: `<Dropdown>` only, color tokens only, 44 px touch targets, check light and dark mode and 375 px width, `npm run lint`, `npm run typecheck`, `npm run build` and `deno check` on each Edge Function must pass.
- `node_modules/next/dist/docs/` before writing Next.js code (this Next.js version differs from your training data).
- `lib/offices.ts`: the single place that describes each office (label, header-switch name, role word, term length, record and money sources).
- `lib/format.ts`: `TOPIC_LABELS`. `cannabis_thc` → "Cannabis and THC" already exists.
- `lib/queries.ts`: `POLITICIAN_ORDER` and `loadLedger()` (cached for minutes, so local checks need about a minute after a database write).
- `supabase/functions/tx_sync/index.ts`: today's Sync.
- `scripts/mirror-campaign-site.mjs`: the crawler that built every campaign-site mirror. Read its header.
- The description of PR #6 on GitHub (`gh pr view 6`) for how District 112 and the archives were done.

## Database facts

- Supabase project `bqyfplifeyvkilkoneph`, schema `tx_tracker`. New tables, functions or settings are prefixed `tx_`.
- `politicians`: `name, slug, office, district, party, election_date, term_start, status ('elect'), x_handle, x_user_id, campaign_site_url, archive_url, official_site_url, portrait_url, portrait_credit, portrait_source_url`. Existing party values are spelled `Democratic`.
- `sources`: `politician_id, source_type ('campaign_page' | 'x_post' | 'third_party_commentary'), url, archive_url, title, published_at, raw_excerpt, metadata jsonb`.
- `promises`: `politician_id, summary_text, verbatim_quote, topic, date_said, source_id, source_url, archive_url, status ('pending'), confidence ('high'), notes, promise_type ('explicit_pledge' | 'platform')`. Every existing promise has a `source_id`. Leave `date_said` null when the source shows no date, and explain why in `notes`.
- `tx_record_actions`: votes, sponsorships, signings (`kind, bill_id, title, position, result, acted_on, source_name, source_url, external_id` unique).
- There are no triggers. Set `updated_at` yourself when a row's meaning changes. **Do not bump a promise's `updated_at` for metadata-only edits** such as adding an archive link: agents read `updated_at` as "what's new".

## Part 1: Vikki Goodwin

### Verify first (leads, from news coverage)
- She won the November 3, 2026 race for Lieutenant Governor (AP call; the opponent conceded). Results are unofficial until canvassed, so use `status = 'elect'`.
- She is the current state representative for **Texas House District 47** (Austin area). Confirm her years in the House from Texas Legislature Online (TLO), since that decides which House votes she cast.
- The Lieutenant Governor's term starts on **January 19, 2027**, the same inauguration day as the governor (Hinojosa's `term_start` is `2027-01-19`). It is a four-year term. Confirm both.

### Office
- Add a `tx_lt_governor` entry to `lib/offices.ts`:
  - label "Lieutenant Governor of Texas"
  - header-switch name "Lt. Governor"
  - role "lieutenant governor"
  - 4-year term
- **What the record looks like:** the Lieutenant Governor presides over the Texas Senate, refers bills, names committees and votes only to break a tie. So the "How they voted" tab needs copy that fits that role, and the record sources are the **Texas Senate Journal** and TLO. Money comes from the **Texas Ethics Commission**. Verify these duties from the Texas Constitution or the Senate's own site before writing the copy, and keep it neutral.
- Add matching entries to `lib/data-sources.ts` and the roadmap text, the same way `tx_house` was added.
- **Order of the header switch:** Senator, Governor, Lt. Governor, District 112. Update `POLITICIAN_ORDER` in `lib/queries.ts`.
- **Header fit:** with four buttons the switch may not fit at 375 px. Check it, and fix it without horizontal page scroll (wrap, or scroll the switch itself with visible affordance). Check light and dark mode.

### Campaign site mirror: https://www.vikkigoodwin.com/
- It is a **Squarespace** site with a normal `sitemap.xml`: about 60 URLs under `/blogposts` (2018) and `/news-posts` (2021–2026). Also mirror the top-level pages (home, about, issues or priorities, and the like) even if the sitemap misses them; pass them as extra URLs.
- **Run the crawler:**
  `node scripts/mirror-campaign-site.mjs https://www.vikkigoodwin.com goodwin public/archive "<Chromium path>"` with `ASSET_HOSTS="squarespace-cdn\.com|squarespace\.com"` so Squarespace images and CSS are saved locally.
  - Playwright is not a project dependency. Install it in a scratch folder or as a dev dependency.
  - Point it at an existing Chromium. The Playwright cache on this Mac has `chromium-1248`.
- **Use the browser's real user agent.** A faked one got 403s on another campaign host.
- **Before copying the mirror into `public/archive/goodwin/`, verify it:**
  - 0 asset failures that are real files. Folder URLs are not files.
  - No requests to vikkigoodwin.com or Squarespace hosts when you load the mirror.
  - No broken images.
  - Internal links stay inside `/archive/goodwin/`.
  - `noindex` plus a canonical link are present.
  - `archive-manifest.json` is written.
- **Forms:** disable any form (petition, signup, contact) in the copy so the archive cannot collect visitors' personal information, and record that in the manifest's `modifications` array. See `public/archive/gina/act/archive-manifest.json`.
- **Local preview:** `next dev` does not serve folder index pages under `public/` (`/archive/goodwin/issues/`). Preview with `python3 -m http.server -d public` instead. Vercel serves them fine.
- **Campaign subdomains:** look for subdomains the campaign uses for petitions or signups (Hinojosa's THC pledge was only on `act.ginafortexas.com`, which the main mirror missed). Mirror any page that states a position, using `SINGLE=1`.
- **Many `/news-posts` entries are reposted news coverage.** That is news, not the candidate's own words. Do not cite a news story's paraphrase as a promise. Only a direct quote of the candidate in her own release, post, or op-ed that she authored counts. When unsure, leave it out and list it in your report.

### Politician row, portrait, promises
- **Politician row:** insert it with `office = 'tx_lt_governor'` and `district` null. Set `archive_url` to `https://tx-promise-tracker.vercel.app/archive/goodwin/` (use `SITE_URL` from `lib/site.ts` in code, never a hard-coded preview address).
- **Portrait:** save a credited copy into `public/portraits/vikki-goodwin.webp`, from her campaign site or official House photo. Never point `portrait_url` at a campaign or third-party host: `next/image` rejects it and it rots when the site goes down.
- **Promises:** extract them from her campaign pages and her own X posts.
  - Each one is verbatim, with its source row and archive link.
  - `explicit_pledge` for "I will…" or "As Lieutenant Governor, I will…"; `platform` for broader positions.
  - Reuse existing topic codes where they fit (see `TOPIC_LABELS`); add new codes with labels only when needed.

## Part 2: Two topics, every official

For **each** of Talarico, Hinojosa, Herbert and Goodwin, find and record **every individual pledge or stated position** on these topics, with a primary source for each. Then search the House and Senate Journals for their **recorded votes** on the related bills.

### Topic A: Cannabis and THC (`cannabis_thc`, already exists)
Already found in the previous session, so verify it and don't duplicate:
- **Talarico:**
  - Two pending promises from jamestalarico.com: the public-safety page and the freedom-family-faith page.
  - Primary author of cannabis bills HB 4089 (87R) and HB 5307 (89R), per TLO.
- **Hinojosa:**
  - One explicit pledge from the THC petition on `act.ginafortexas.com`, which is archived.
  - Her main campaign site had nothing on the topic.
- **Herbert:** no position found on his site, X posts, or the Community Impact Q&A.
- **SB 3 (89R, the 2025 THC ban the governor vetoed):**
  - Hinojosa and Talarico voted Nay on record votes RV#3191 (the Oliverson amendment that made possessing hemp products with any cannabinoid other than CBD or CBG an offense), RV#3192 (second reading), and RV#3304 (final passage).
  - House Journal 89th Legislature, days 69 and 70: `https://journals.house.texas.gov/HJRNL/89R/HTML/89RDAY69FINAL.HTM` and `…DAY70FINAL.HTM`.
  - **Goodwin's name is also on the Nays list for RV#3191.** Confirm all three of her SB 3 votes.
- Also check any 2025 special-session hemp or THC bills (for example SB 5, as reported) and how each official who was in the Legislature voted.

### Topic B: Adult websites and online age verification
Add a neutral topic code, `adult_content_age_verification`, labeled **"Adult content and age verification"**. Do not use "porn" in site copy. You may say "adult websites".

Leads to verify (from news coverage):
- **HB 1181 (88th Legislature, 2023)** requires websites where more than one-third of the material is harmful to minors to verify users' ages. The governor signed it in June 2023.
- The U.S. Supreme Court upheld it on **June 27, 2025** (*Free Speech Coalition v. Paxton*).
- Pornhub and its sister sites then blocked Texas users rather than comply. That is a business decision by those sites, not a state block. Describe it that way.
- The Attorney General enforces it.
- Look for later related laws too, for example 2025 bills on app-store age verification or device filters, and confirm each on TLO.

For each official:
- Find statements or pledges on their campaign sites, campaign subdomains, and their own X posts.
- Talarico, Hinojosa and Goodwin were House members in 2023. Find **their record votes on HB 1181** in the House Journal: TLO bill history for `88R HB1181` gives the record vote numbers, and the journal day page lists who voted Yea or Nay. Do the same for any later related bill they voted on.
- Herbert held no office, so record only statements, or record that nothing was found.

### How to store what you find
- **Pledges and positions** go in `promises`, each with a `sources` row and an archive link.
- **Votes cast before the current office** (as state representatives) are real public record, but they are not actions in the office being tracked:
  - Don't mix them into the new office's "How they voted" list as if they were.
  - Propose and implement a clear model. For example, add `tx_record_actions.office_context` (such as "Texas House, District 49 (89th Legislature)") and show these under a labeled "Earlier record" section, or a filter.
  - Source URL = the journal page. `external_id` = `house:<session>:<record number>:<member>`.
  - Keep the vote and the promise separate. Only link a vote to a promise when it directly bears on that exact promise.
- **Final report:** a table per official per topic listing every item with its source URL, plus what you searched that turned up nothing. "Nothing found" is a valid result. Never fill gaps.

## Part 3: One global Sync that checks every topic for every official

**How Sync works today:**
- One Sync button, shown on each official's "For the nerds" page.
- It calls the `tx_sync` Edge Function, which already loops over **all** officials, at most once per 24 hours for the whole site (`tx_claim_sync`).
- But it only pulls Congress.gov bills, Senate roll calls and FEC money for the U.S. senator. For everyone else it only logs "not automated yet". It never looks at campaign pages, posts or topics.
- And because the button sits on a per-official page, it reads as per-candidate.

**Build:**

1. **Topic registry:** a table `tx_tracker.tx_topics`:
   - `code` (primary key), `label`, `keywords text[]`, `related_bills jsonb` (such as `[{"session":"89R","bill":"SB3"},{"session":"88R","bill":"HB1181"}]`), `active boolean`.
   - Seed it with `cannabis_thc` and `adult_content_age_verification`. Use specific keywords so "THC" doesn't match "healthcare": match whole words and case-sensitive acronyms.
   - The site's topic labels should come from one place. Either read labels from the registry, with `TOPIC_LABELS` as fallback, or generate one from the other. Don't keep two lists that can drift.
   - Adding a row is all it should take for the next Sync to check a new topic.

2. **Topic sweep in `tx_sync`:** for every official and every active topic:
   - Fetch the official's campaign sitemap (and known campaign subdomains, stored on the politician or in `metadata`).
   - Fetch changed pages only: keep a content hash per URL.
   - Match keywords in visible text.
   - Write each match to a review table `tx_tracker.tx_topic_findings`: `politician_id, topic, url, excerpt, keyword, content_hash, found_at, status ('new' | 'promoted' | 'dismissed')`, unique on `(politician_id, topic, url, content_hash)`.
   - **Findings are never published as promises automatically.** Rules 2 and 3 require a person (or an agent acting for one) to confirm the verbatim quote and source before it becomes a promise.
   - If an X API credential exists in `tx_private_settings`, also scan the official's own recent posts. If none exists, log it in the run notes; do not scrape X.

3. **Bill and vote check in `tx_sync`:**
   - For each `related_bills` entry, fetch the TLO history and the journal record votes.
   - Upsert votes for any tracked official who was a member, using the `office_context` model from Part 2.
   - Also record new actions on watched bills (filed, passed, signed, vetoed) as findings.

4. **Limits:**
   - Keep the 24-hour site-wide cooldown and the other protections in rule 16.
   - Edge Functions have a wall-clock limit, so batch the work: cap the pages per run, keep a resume cursor, and finish in later runs.
   - Each source runs on its own: one failure goes into `errors` and does not stop the others.

5. **Make it read as global:**
   - Label the button and status for what it does, for example "Sync all officials" and "Checks every official's sources and topics. Runs at most once a day for the whole site."
   - Show the last run's results summary: counts per official and topic, plus new findings awaiting review.
   - Keep it below the content and right-aligned (rule 10).
   - Consider also placing it on one site-wide page (such as `/how-we-track` or `/roadmap`) so it isn't tied to one official.

6. **Deploy:** run `deno check` on both functions. Deploying `tx_sync` changes production: ask the user before deploying, and don't trigger a production sync yourself (it uses the site's one sync per day).

## Things that bit the last session
- **`capitol.texas.gov` is unreliable by direct request.** Bill pages may fail with curl while the fetch tool works; `capitol.texas.gov/tlodocs/...` bill text and `journals.house.texas.gov` HTML download fine.
- **Wayback Machine saves:** saving to the Wayback Machine (`web.archive.org/save/…`) may be blocked by your session's permissions. If so, give the user the save links instead of working around it.
- **Archive links:** promise `archive_url`s use `https://tx-promise-tracker.vercel.app/archive/<name>/<path>` and only work after deploy.
- **Never commit:** the `TEMP-PREVIEW` block in `lib/queries.ts`, `.claude/`, or `app/assets/`.
- **Pre-existing dev insight:** the "URL data outside Suspense" insight is fixed on the politician pages. Keep new pages that read `params` inside `<Suspense>` the same way.

## Done means
- **Goodwin's profile:**
  - Live locally from real database rows: header switch, profile, "For the nerds", portrait.
  - Her mirror is verified in the browser.
  - Her promises are entered with sources and archive links.
- **Both topics:**
  - Researched for all four officials.
  - Every pledge and vote stored with a primary source.
  - A per-official report of found and not-found items.
- **Sync:**
  - `tx_topics` and `tx_topic_findings` exist through a migration in `supabase/migrations/`.
  - `tx_sync` checks every active topic for every official.
  - The Sync UI reads as global.
- **Checks and PR:**
  - lint, typecheck, build and `deno check` pass.
  - Light, dark and 375 px checked.
  - A PR opened against `main` that lists every production database change you made, and anything you could not verify.
