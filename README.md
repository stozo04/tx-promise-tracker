# Promise vs. Delivered (Texas Promise Tracker)

An independent public ledger of what James Talarico and Gina Hinojosa promised, so people can check later whether they delivered.

This is not a campaign site and not a site of the State of Texas. It only shows records that are stored. It does not invent quotes, votes, or donors.

The data lives in the Supabase schema `tx_tracker`. The website only reads it. The only writes go through two Supabase Edge Functions, `tx_community_vote` and `tx_sync`, described under [Supabase](#supabase).

## Run it locally

Use Node.js 22.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev server also allows `127.0.0.1`, so the page still hydrates if you open it that way.

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `next typegen` and `tsc --noEmit` |
| `npm run build` | Production build. It reads the live ledger while it prerenders. |
| `deno test --allow-read --node-modules-dir=none supabase/functions/tx_sync/tests/` | Sync's unit tests, run on saved primary-source pages |
| `deno run --allow-net --allow-env=DATA_GOV_KEY --node-modules-dir=none scripts/sync-live-check.ts` | Runs Sync's parsers on the live sources (no writes) and prints statistics |

## Environment variables

Copy `.env.example` to `.env.local`. The publishable key is public. It is safe in the browser and can only read `tx_tracker`. Do not add a service-role key.

| Name | Required | Where |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Local, GitHub Actions, Vercel Production, Preview, and Development |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Same |
| `NEXT_PUBLIC_SITE_URL` | No | Vercel Production, after the site has a domain. Used for Open Graph URLs. |

`NEXT_PUBLIC_` values are inlined at **build** time. Set them in Vercel before the first deployment, not only at runtime.

GitHub Actions copies `.env.example` to `.env.local` before lint, typecheck, and build. That file holds the same public key. No repository secret is required for CI.

## Pages

- `/` scoreboard, days until the oath, and coming-soon cards
- A header theme button. It follows the system setting until you pick light or dark, then remembers that choice in this browser.
- `/politicians/james-talarico` and `/politicians/gina-hinojosa`: Promise vs. Delivered. The flag panel, an at-a-glance chart of each explicit pledge, and Said / Did cards that pair each promise with the evidence filed against it
- `/politicians/[slug]/nerds`: upcoming events, votes, campaign money, the archived campaign site, data sources, and the Sync button
- `/events`: a month calendar and an agenda of upcoming events for all four officials (session and floor days, committee hearings, dates set by law, campaign events). One dropdown narrows it to an official (`?official=vikki-goodwin`) and one to a kind of event; the month and view are in the URL too. Times are Central. A month with nothing loaded names the sources that will fill it.
- `/events/[id]`: one event with its official(s), time, place, body, details and status, and a link to the page that announced it, or, for a date the law sets, the citation, the law's text and the date it was computed from
- `/promises/[id]` quote, source, archive, and status timeline
- `/archives` screenshots
- `/how-we-track` methodology
- `/roadmap` what is live, and what is not started
- `/agents` how software should read the site
- `/llms.txt` and `/api/openapi.json`

## Agent API

Read only.

- `GET /api/politicians`
- `GET /api/politicians/{slug}/summary`
- `GET /api/promises` with `politician`, `topic`, `status`, `type`, `q`, `source`, `limit`, `offset`
- `GET /api/promises/{id}`
- `GET /api/sources`
- `GET /api/openapi.json`
- `GET /api/sync`: where the site-wide sync cooldown stands. The sync itself is `POST {NEXT_PUBLIC_SUPABASE_URL}/functions/v1/tx_sync`.

`type` is `explicit_pledge` or `platform`. `status` is `pending`, `in_progress`, `kept`, `partial`, `broken`, `superseded`, or `unverified`.

Each status update is shown as one action under its promise. Its direction comes from the status it set: `kept` and `in_progress` match the promise, `broken` goes against it, `partial` partly matches, and `superseded` is neutral. One promise can collect actions that point both ways over time.

Voting records and donations are not in the API. The field `not_yet_tracked` says so. Do not invent them.

## Contributing

Issues and pull requests are welcome at [stozo04/tx-promise-tracker](https://github.com/stozo04/tx-promise-tracker). Use the issue templates. The website itself stays read-only. Writes go only through the Edge Functions in `supabase/functions`.

### Suggest a promise

Open an issue with the template **Suggest a promise**. Include:

- The politician
- The verbatim quote, copied exactly
- A primary source URL (the page, post, or video where they said it)
- The date on that source, if it has one
- Whether it is an explicit pledge ("I will…") or a platform line

A news story that only paraphrases them is not a primary source. New promises start as pending.

### Propose a status change

Open an issue with the template **Propose a status change**. Include:

- A link to the promise
- The status you propose: `in_progress`, `kept`, `partial`, `broken`, or `superseded`
- An evidence URL (a vote, a signed bill, a veto, a budget, an official act, or their own later statement)
- A short note of what that evidence shows, and the date on it

A status does not change on a hunch. Pending stays pending until the evidence is public.

## Records, money, and community votes

### Voting record

- **James Talarico:** bills he sponsors or co-sponsors (Congress.gov) and his Senate roll-call votes (senate.gov), loaded by Sync once his term starts.
- **Gina Hinojosa:** bill signings, vetoes, and executive orders are added by hand for now. Texas Legislature Online and the Office of the Governor are not automated yet.
- **Vikki Goodwin:** the lieutenant governor presides over the Texas Senate and votes only in the Committee of the Whole or to break a tie. The Texas Senate Journal is not automated yet.
- **Zach Herbert:** Texas House record votes once the term starts. Not automated yet.
- **Earlier record:** votes and bills from an office held before the one tracked now (for example, a state representative's House votes) have `office_context` set, such as "Texas House, District 47 (88th Legislature)". The page shows them under "Earlier record", never as actions in the new office. Sync adds House record votes on each topic's watched bills for every official listed in `tx_tracker.tx_legislative_service`.

A record is tied to a promise (`promise_id`) only when it really bears on it. A missing link is not a claim that it is unrelated.

### Donations

- **James Talarico:** FEC totals for the cycle, the share from donors giving $200 or less, the Texas share of itemized individual dollars, donors' top employers, and the 100 largest itemized individual gifts, each linked to the filing that reports it.
- **Gina Hinojosa:** Texas Ethics Commission reports are not automated yet.

Do not rank donors as a judgment or imply that a gift bought a promise.

### Community votes

Each action in a Did card and each record on the For the nerds page has a "How would you vote?" box. One vote per connection per item: the Edge Function hashes the visitor's IP with a private salt and keeps only the hash, and a second vote from the same hash is refused. Results stay hidden until you vote. It is not a scientific poll, and the page says so.

### Sync

Anyone can press "Sync all officials" (on each For the nerds page and on How we track), but the whole site gets one sync per calendar day in Central time. If nobody presses it, a pg_cron job starts it at 11:30 pm CT. `tx_tracker.tx_claim_sync()` claims the day under an advisory lock, so two presses at once cannot both start one. After a run the button says how long until midnight CT. Each source runs in its own request and fails on its own, and the run's counts, notes, and errors are written to `tx_tracker.ingest_runs` and listed under "Last run results". [SYNC.md](SYNC.md) covers every source.

Sync also loads the Events calendar (`tx_upcoming_events`) from five sources: dates set by law (read from the law's text each run), Texas Legislature Online floor calendars and committee meetings, the U.S. Senate's floor schedule, tentative schedule and committee hearings, and each campaign's own events page. Hearings are matched through committee membership stored in `tx_committee_memberships`. Events are refreshed when their time, place or agenda changes, and never deleted. See [SYNC.md](SYNC.md#events).

One run covers every official and every active topic in `tx_tracker.tx_topics` (see `supabase/functions/tx_sync/topics.ts`):

- **Campaign pages.** Each official's campaign sitemap, plus `politicians.campaign_watch_urls` for subdomain pages, is listed in `tx_watched_pages`. Each run reads every page in batches of 100, oldest-checked first, until all are read or the run's time is up. A page is matched again only when its visible text changes. Keyword matches are whole-word; an all-caps keyword such as `THC` matches case-sensitively.
- **Watched bills.** For each topic's `related_bills`, Sync reads the Texas Legislature Online history and the House Journal record votes, and stores how each official in `tx_legislative_service` voted, with `office_context` set. Stored votes are never overwritten. Bill actions from the last 30 days become findings.
- **X posts.** Only with an X API bearer token in `tx_private_settings` (`x_bearer_token`). Without one, the run notes say so. X is never scraped.
- **Review queue.** Matches go to `tx_topic_findings` with status `new`. A finding never becomes a promise by itself: a person confirms the verbatim quote and the source, adds the promise, and sets the finding to `promoted` (with `promise_id`) or `dismissed`.

To add a topic, insert a row in `tx_topics` with a code, a label, keywords and any related bills. The next Sync checks it for everyone, and the site uses its label.

## Supabase

Everything for this project is prefixed `tx_`.

- `supabase/migrations/`: the `tx_` tables (`tx_record_actions`, `tx_upcoming_events`, `tx_contributions`, `tx_contribution_summaries`, `tx_community_votes`, `tx_private_settings`, `tx_topics`, `tx_topic_findings`, `tx_watched_pages`, `tx_legislative_service`, `tx_committee_memberships`), the `tx_community_vote_totals` view, and `tx_claim_sync()`. Public roles can read records and vote totals. They cannot read raw votes or private settings, and they cannot write.
- `supabase/functions/tx_community_vote`: `GET ?items=status_update:<id>,record_action:<id>` returns your vote and the totals. `POST {item_type, item_id, choice}` records a vote, or answers `409` "You've already voted on this."
- `supabase/functions/tx_sync`: `POST` starts a sync, or answers `429` with how long to wait.
- `tx_tracker.tx_private_settings` holds the IP hash salt and the api.data.gov key (Congress.gov and FEC). Only `service_role` can read it. An Edge Function secret named `TX_DATA_GOV_API_KEY` takes precedence if you set one.

Portraits: put the image in `public/portraits/` (or the `tx-campaign-archives` storage bucket), then set `portrait_url` (for example `/portraits/james-talarico.webp`), `portrait_credit` and `portrait_source_url` on the politician. The portrait shows only when both a URL and a credit are set. Today's portraits come from the campaign websites. Swap in the official portraits after the terms start.

Both functions are deployed with JWT verification off because they are public by design and check their own input.

## Deploy on Vercel

The app is a Next.js App Router project. Vercel detects it. There is no `vercel.json`. Leave the framework defaults alone.

1. Import the GitHub repository `stozo04/tx-promise-tracker`.
2. Framework preset: **Next.js**.
3. Root directory: repository root.
4. Node.js version: **22.x** (also set in `package.json` `engines`).
5. Install command: default. The repo has `package-lock.json`.
6. Build command: default `next build`. Do not set an output directory.
7. Production branch: **main**.
8. Production deploys: on, so a merge to `main` deploys production.
9. Preview deploys: on, so pull requests get a preview.
10. Environment variables, for **Production**, **Preview**, and **Development**:
    - `NEXT_PUBLIC_SUPABASE_URL` = `https://bqyfplifeyvkilkoneph.supabase.co`
    - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the publishable key in `.env.example`
11. After the first deploy, optionally set `NEXT_PUBLIC_SITE_URL` on **Production** to the real `https` origin and redeploy.

Do not add `SUPABASE_SERVICE_ROLE_KEY` or any secret key. The build reads the ledger, so the two public variables have to be present or the build fails on purpose.

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, and build on pull requests and on pushes to `main`.

## License

[MIT](LICENSE). Copyright 2026 Steven Gates.
