# Agent prompt: an Events page with a cited calendar of upcoming events for every official

Copy everything below the line into a new agent session started in this repo.

---

You are working in the Promise vs. Delivered repo (`tx-promise-tracker`), a neutral public ledger of what newly elected Texas officials promised and what the public record shows they did. Build an **Events** page: a calendar of upcoming events for every tracked official (session and floor days, committee hearings, legal deadlines, public appearances). By default the calendar shows all four officials, and a dropdown narrows it to one. **Every event is cited**: clicking an event opens its own page with the details and a link to the primary source that announced it. Sync loads the events daily from those sources.

Work in **one new branch** cut from the latest `main`. Open one pull request when done.

## Read first

- `AGENTS.md`. The rules are binding. The ones that matter most here:
  - Every event links to a **primary source**: the Texas Legislature (Texas Legislature Online, the House and Senate calendars and journals), Congress.gov, senate.gov, the Office of the Governor, the Texas Secretary of State, or the official's own campaign or office site. **News stories are never evidence.**
  - **Never invent or estimate a date.** A deadline is shown only when a primary source states it, or when the law that sets it is cited and the date is computed exactly as that law says (show the citation). If a source gives no time, show no time. If nothing is loaded, say "Not loaded yet" and name where it will come from.
  - Neutral copy: describe the event, not the people, parties or policies. **No election results or vote totals.** An election day may appear as a date; results never do.
  - UI: `<Dropdown>` from `components/dropdown.tsx` (rule 6, "All …" first then A to Z, rule 7), color tokens only (rule 8), external links open in a new tab through `ExternalLinksInNewTab` (rule 9), 44 px touch targets, full keyboard support, an `aria-label` on every icon-only control, checked in light and dark mode and at 375 px width (rule 13).
  - Links meant to be shared use `SITE_URL` (rule 14). No hard-coded `supabase.co` addresses (rule 15).
  - The JSON API: if you add an endpoint, update `components/agent-prompt.tsx`, `app/llms.txt/route.ts` and `lib/openapi.ts` (rule 20).
- `node_modules/next/dist/docs/` before writing Next.js code. This Next.js version differs from your training data. Read the guides for routing, dynamic routes, `generateStaticParams`, and the cache components (`"use cache"`, `cacheLife`, `cacheTag`) used in `lib/queries.ts`.
- `SYNC.md`: how Sync works. **Read the whole thing.** Key points:
  - The source registry (`supabase/functions/tx_sync/sources.ts`) decides what runs per office and what the run notes call "not automated".
  - Every source runs in its own stage request, because Edge Functions get 2 seconds of CPU per request.
  - Sources match officials on stored IDs, never on names.
  - Insert-only versus refresh rules, `tx_checked_items`, and the per-run limits.
- `supabase/functions/tx_sync/shared.ts` (`Ctx`, `Http`, `upsert`, `knownIds`, `checkedItems`, `centralDate`, `texasLegislature`), `texas.ts` and `journal.ts` (examples of Texas sources), and `tests/sync_test.ts` (the test style: real pages saved as fixtures).
- `lib/offices.ts`: each office's `upcoming` label, `officeUpcoming()`.
- `components/nerds-tabs.tsx`: the existing **Upcoming** tab on each official's nerds page. It already reads `ledger.upcomingEvents` and shows "Not loaded yet" when empty.
- `components/site-nav.tsx`: the header navigation, where the new **Events** link goes.
- `lib/queries.ts` (`loadLedger`, cached for minutes; `POLITICIAN_ORDER`) and `lib/types.ts` (`UpcomingEventRow`).
- `components/promise-explorer.tsx`: how an existing page filters with `<Dropdown>`.

## What exists

- Table `tx_tracker.tx_upcoming_events`: `id uuid, politician_id uuid, title text, starts_on date, when_label text, source_name text, source_url text, external_id text, created_at`. It has **0 rows** and nothing fills it. Public roles can read it.
- The ledger loads it as `upcomingEvents`. The nerds page's Upcoming tab shows it, filtered by year.
- Officials and term starts:
  - Talarico, `us_senate`: 2027-01-03.
  - Herbert, `tx_house`, District 112: 2027-01-12.
  - Hinojosa, `governor`: 2027-01-19.
  - Goodwin, `tx_lt_governor`: 2027-01-19.
- IDs already stored: `politicians.fec_candidate_id`, `bioguide_id`, `lis_member_id`, `tec_filer_id`, and `tx_legislative_service.tlo_member_code` and `journal_name`. Some are empty until the official is seated, and Sync notes them.

## Part 1: The data model

Extend `tx_upcoming_events` in a new migration (keep it, do not replace it):

- `kind text not null`, checked against: `session_day`, `floor_vote`, `committee_hearing`, `deadline`, `appearance`.
- `ends_on date`, `starts_at timestamptz` (null when the source gives no time), `time_zone text default 'America/Chicago'`.
- `location text`. `details text`: the source's own description or agenda, verbatim or a neutral summary, never commentary.
- `body text`: who holds it, for example "Texas House", "Senate Committee on State Affairs", "U.S. Senate".
- `legal_basis text`: for a computed deadline, the citation, for example "Tex. Const. art. 4, §14".
- `status text default 'scheduled'`, checked against `scheduled`, `changed`, `cancelled`, `held`. Keep cancelled events and show them as cancelled; never delete them silently.
- `updated_at timestamptz`.
- A unique index on `external_id`. Index `(starts_on)`.

Rules:

- **Events for everyone.** Many events (a Senate session day, a statewide deadline) apply to more than one official. Store **one row per official per event**, with `external_id` like `tlo_hearing:{session}:{committee}:{date}:{slug}`.
- **Who an event belongs to:**
  - The governor gets bill-action and veto deadlines and special-session dates.
  - The lieutenant governor gets Texas Senate session days and Senate deadlines.
  - The representative gets Texas House session days, floor calendars, and hearings of committees they sit on.
  - The senator gets U.S. Senate session days, scheduled votes, and hearings of their committees.
  - Committee membership must come from the primary source (TLO committee membership pages, congress.gov committee assignments). It is stored, never guessed.
- **Refresh, unlike votes.** Schedules change, so events are upserted on `external_id` to pick up time, place and agenda changes, and `updated_at` is set when something changed.
  - An event that disappears from its source before its date is marked `cancelled` only if the source says so. Otherwise it is noted in the run and left as is.

Update `UpcomingEventRow` in `lib/types.ts` and anything that reads it.

## Part 2: Sources (Sync)

Add one Sync source per kind of event to the registry in `sources.ts`, each in its own module with unit tests on saved real pages, following SYNC.md. Research each source first. **Confirm the exact page or API and its format with real requests before writing a parser**, and record what you found in SYNC.md. Leads to verify, not facts:

- **Texas House and Senate session days and floor calendars.** Texas Legislature Online publishes daily House and Senate calendars and the session schedule. The House calendar page is https://capitol.texas.gov/Calendars/CalendarsHouse.aspx and is required: the calendar must load from it. The 90th Legislature convenes **2027-01-12** (Texas Government Code §301.001: the second Tuesday in January of odd years). Cite that section for the convening date.
  - **Confirmed on 2026-11-10** (real requests; both lists were empty because the Legislature is in the interim):
    - RSS 2.0 feeds, `text/xml`: `https://capitol.texas.gov/MyTLO/RSS/RSS.aspx?Type=upcomingcalendarshouse`, `…Type=upcomingcalendarssenate`, `…Type=upcomingmeetingshouse` and `…Type=upcomingmeetingssenate`. When nothing is posted, each has one `<item>` titled "No committee meetings scheduled." (or the calendar equivalent) whose `<guid>` is the HTML page. Treat that item as "no events", never as an event. Prefer these feeds over scraping the HTML.
    - The HTML pages behind them: `Calendars/CalendarsByLegislature.aspx?Chbr=H` ("Upcoming House Calendars", says "There are no upcoming calendars." when empty), `Calendars/CalendarsByDate.aspx?Chamber=H`, and `Committees/MeetingsUpcoming.aspx?Chamber=H` (and `Chamber=S`).
    - The feed items' format when the lists are full was **not** seen yet. Save a populated feed as a test fixture as soon as one is posted (expect interim committee hearings before January, and daily calendars once the session starts), and write the parser against that, not against a guess.
  - Each event's citation is the item's own link on capitol.texas.gov (the calendar or meeting notice), not the feed URL.
- **Committee hearings.** TLO lists upcoming committee meetings with notices and agendas (capitol.texas.gov, under Committees). Congress.gov's API has committee meetings (`/committee-meeting`), and senate.gov publishes committee hearing schedules. Store only hearings of committees the official sits on, from stored membership.
- **U.S. Senate.** The Senate's floor schedule and the Daily Digest. Votes are already loaded by Sync after the fact. This source is for scheduled days and votes only.
- **Legal deadlines.** Prefer a published official calendar: the Texas Legislative Council or TLO session deadlines, the Texas Secretary of State's calendars. For a deadline the law sets relative to another date, compute it only from that rule, store `legal_basis`, and show "Computed from [citation]" on the event page. Examples:
  - The governor's veto period (Tex. Const. art. 4, §14).
  - The 60-day bill filing deadline (Tex. Const. art. 3, §5).
  - Swearing-in days, from each official's `term_start` and the law or official notice that sets them.
- **Public appearances.** The official's own campaign or office site event pages (several are already in `tx_watched_pages`, for example `vikkigoodwin.com/events`). Take the date, time, place and title only as the page states them. Campaign events stay labeled as campaign events. Do not scrape X.

Each source:

- Fails on its own.
- Writes notes for missing IDs or memberships.
- Respects the per-run limits in SYNC.md.
- Never runs a request burst against one host (the TEC's CDN taught us that).

Events before an official's `term_start` are allowed only when they concern that office (a swearing-in day, a session the official will sit in).

## Part 3: The Events page

- **Route:** `/events`. Add an **Events** link to the header navigation in `components/site-nav.tsx`, same tab, internal link. It works without choosing an official.
- **Calendar:**
  - A month grid on wide screens with previous, next and Today controls.
  - On narrow screens, and as a toggle on wide screens, an agenda list grouped by day, so the page works at 375 px.
  - Each event shows its time (or "All day" or "Time not given"), the title, the official's name or a color chip per official (tokens only), and a small kind label: Session, Floor vote, Hearing, Deadline, Appearance. Cancelled events are struck through and say "Cancelled".
- **Filter:** one `<Dropdown>` labeled for the official: "All officials" first (the default), then each official A to Z. Persist the choice in the URL (`?official=vikki-goodwin`) so a filtered view can be shared. A second `<Dropdown>` for the kind of event ("All events" first) is welcome. No native `<select>`.
- **Time zone:** all dates and times in Central time, said once on the page ("Times are Central").
- **Empty and loading states:** while a month has no events, say so, and say which sources fill it ("Not loaded yet: Texas Legislature Online committee notices, …"). Never show placeholder events.
- **Footer:** below the calendar, right-aligned (rule 10), one line naming the sources and the last Sync time.

## Part 4: The event page

- **Route:** `/events/[id]`. Every event in the calendar links here (internal link, same tab). The page is shareable; use `SITE_URL` for its canonical and share links.
- **Shows:**
  - The title, the official(s), the kind, the date and time in Central time, the location, the body, and the details or agenda.
  - The status, and "Last updated …" when `updated_at` is set.
  - **The citation**: the source name and a link to the exact page or document that announced the event (opens in a new tab). For a computed deadline, the `legal_basis` with a link to the law's text on statutes.capitol.texas.gov, and the date it was computed from.
- **Related links:** each official's page and nerds page, and, when the event names bills, the bills' Texas Legislature Online or Congress.gov pages.
- **Not found:** the standard 404 for an unknown id.

Also:

- Make the existing **Upcoming** tab on each nerds page read the same data and link each row to its event page.
- Remove "Not loaded yet" there once events exist.
- Update `lib/data-sources.ts` and `lib/offices.ts` copy to say what is loaded.

## Part 5: The API (optional, but if you add it, document it)

`GET /api/events?official={slug}&from=YYYY-MM-DD&to=YYYY-MM-DD&kind=…` returns the events with their sources. If you add it, update `components/agent-prompt.tsx`, `app/llms.txt/route.ts` and `lib/openapi.ts` (rule 20).

## Proof

The goal is fixes you can prove. For each source:

- **Unit tests** on saved real pages: the parser finds every event the page lists, with the right date, time and committee.
- A **live check**: extend `scripts/sync-live-check.ts` with an `events` section that prints, per source, how many events it found and a sample, and compares the count to what the page itself lists.
- A **live Sync run** after deploying. Report the counts from `ingest_runs` and `select kind, count(*) from tx_tracker.tx_upcoming_events group by kind`.

For the UI, check `/events` and one `/events/[id]` page in a real browser:

- In light and dark mode, and at 375 px.
- With the official filter on "All officials" and on each official.
- With the keyboard only.

Click through to the source on at least one event of each kind and confirm the date there matches the page.

## Things to watch

- **This is November 2026.** The officials take office in January 2027, so most legislative sources list nothing for them yet.
  - Load what exists: statewide session dates, the Legislature's convening date, swearing-in days, public appearances.
  - Show "Not loaded yet" with the named source for the rest. Do not fill the calendar with guesses.
- **Rule 5:** an election day is a date on the calendar. Never show who won or vote counts.
- **Times:** dates in source pages are often local Texas time with no zone. Store them as `America/Chicago`. U.S. Senate times are Eastern; convert them, and keep the original in `details` if the source states it.
- **The ledger is cached:** `loadLedger()` caches for minutes, so a database change needs about a minute before the page shows it.

## Done means

- [ ] `/events` shows a month calendar and an agenda view of upcoming events for all four officials by default. The official dropdown narrows it to one, and the choice is in the URL.
- [ ] Every event opens `/events/[id]`, which shows its details and links to the primary source (or the law, for a computed deadline).
- [ ] Sync loads each kind of event from a primary source through the registry, with unit tests on real pages and a live-check section. The run notes name any source that is not automated yet.
- [ ] The nerds page's Upcoming tab reads the same events.
- [ ] `npm run lint`, `npm run typecheck`, `npm run build`, `deno check` and `deno test` pass.
- [ ] The UI is checked in light and dark mode and at 375 px.
- [ ] SYNC.md and the README describe the new sources and the page.
- [ ] One pull request lists each source with its proof.
