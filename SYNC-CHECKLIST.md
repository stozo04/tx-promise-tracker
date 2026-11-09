# Sync gaps checklist

What Sync did not cover, found while writing [SYNC.md](SYNC.md). Each item says why it was on the
list, where the data comes from, how to tell it is done, and (under **Status**) what was done and
the proof. A box is ticked only when its "Done when" is met on live data; items that wait on a
date or on someone else say so.

Proof comes from three places:

- **Unit tests**: `deno test --allow-read --node-modules-dir=none supabase/functions/tx_sync/tests/`
  (31 tests, run on real pages saved from each source, and in CI on every pull request).
- **Live check**: `deno run --allow-net --allow-env=DATA_GOV_KEY --node-modules-dir=none
  scripts/sync-live-check.ts` reads the real sources and prints statistics. It writes nothing.
- **The live run** of 2026-11-09 (started 15:19 UTC from the Sync button, 78 seconds), read from
  `tx_tracker.ingest_runs`.

Before the fixes, checked against the code and the live `tx_tracker` data on 2026-11-09:

- **Runs.** Sync has run twice, on Nov. 6 and Nov. 8. The last run took 29 seconds and had no
  errors.
- **Campaign pages.** 491 pages are listed, and 411 of them have never been read.
- **Findings.** 10 page findings are waiting for review. There are no bill-action findings.
- **X.** No X token is stored.
- **Term starts:**
  - Talarico (`us_senate`): 2027-01-03
  - Herbert (`tx_house`): 2027-01-12
  - Hinojosa (`governor`): 2027-01-19
  - Goodwin (`tx_lt_governor`): 2027-01-19

Every new source must follow AGENTS.md: primary sources only, `tx_` names, and a `source_url` on
every row. If a change touches the JSON API, update the agent prompt, `llms.txt`, and
`lib/openapi.ts` as well.

---

## A. Before the new terms start (January 2027)

These are not gaps today because nobody has taken office. Each one becomes a gap on the date
shown.

- [ ] **A1. Texas House record votes for the 90th Legislature** (Herbert, from 2027-01-12)
  - Why: Sync copies House votes only for bills in a topic's `related_bills`, and only for
    officials with a matching `tx_legislative_service` row. Herbert has no rows, so even
    watched-bill votes will be skipped.
  - First step: add Herbert's 90th Legislature row (district 112, the name the Journal uses) from
    the Legislative Reference Library.
  - Then: read every record vote in the House Journal for the term, not only watched bills.
  - Source: Texas House Journal (`journals.house.texas.gov`) and Texas Legislature Online.
  - Done when: a run stores Herbert's record votes for the 90th Legislature, each linked to its
    Journal day page.
  - **Status (code done, waits on Jan. 12 and on the Legislative Reference Library):** Sync now
    reads every House Journal day of the official's term from the journal web service and stores
    every record vote, each linked to its Journal day page with `office_context`
    (`houseJournal` in `texas.ts`). Live check on the 89th Legislature: **137 journal days, 4,235
    record votes, every one listing all 150 members**, and Goodwin, Hinojosa and Talarico each
    found on **4,235 of 4,235**. Unit tests on a real day page (11 of 11 record votes, 150 names
    each). Still open: the Legislative Reference Library does not list Herbert yet (checked
    2026-11-09), so his 90th Legislature row is not added; Sync notes the missing row until it is.
    Add it from LRL once he is listed (district 112, `journal_name` as the Journal prints it).

- [ ] **A2. Bills authored and co-authored in the Texas House** (Herbert)
  - Why: the 19 Texas Legislature Online `sponsored` and `cosponsored` rows now stored were added
    by hand. Sync has no equivalent of the Congress.gov sponsored-bills step for Texas.
  - Source: Texas Legislature Online (`capitol.texas.gov`), the author and coauthor reports.
  - Done when: a run adds each new authored or co-authored bill without hand entry.
  - **Status (code done, waits on Jan. 12 and Herbert's member code):** Sync reads the TLO author
    and coauthor reports for each session of the legislature and dates each bill from its Authors
    page, insert-only, with the same `external_id` as the hand-entered rows (`tloBills`). Live
    check: every report parses to exactly the count it prints (Goodwin 89R 97/97 and 53/53, 88R
    100/100 and 60/60; Talarico 89R 68/68 and 26/26, 88R 96/96 and 44/44; Hinojosa 89R 103/103
    and 26/26, 88R 75/75 and 28/28). Still open: TLO lists Herbert's member code once he is a
    member; add it to `tx_legislative_service.tlo_member_code` (Sync notes it until then).

- [ ] **A3. Governor's actions** (Hinojosa, from 2027-01-19)
  - Why: signings, vetoes, bills filed without signature, and executive orders are all added by
    hand. `tx_record_actions` already allows the kinds `signed`, `vetoed`,
    `filed_without_signature`, and `executive_order`.
  - Sources: Texas Legislature Online bill history ("Signed by the Governor", "Vetoed by the
    Governor"), and the Office of the Governor (`gov.texas.gov`) for executive orders.
  - Done when: a run stores each new action, linked to the bill history or the order itself.
  - **Status (code done, waits on Jan. 19):** Sync reads the TLO signed, vetoed and filed-without-
    signature reports for each session, dates each from the bill history, and reads each new post
    in the Office of the Governor's monthly archive for an executive order PDF (`governor.ts`).
    Live check on the 89th: **1,155/1,155 signed, 26/26 vetoed, 140/140 filed without signature**
    (parsed/printed); the action date found in **75 of 75** sampled bill histories. Executive
    orders, 4 months and 291 posts: **GA-50 to GA-57 all found, every date matching the
    Legislative Reference Library list, no false positives** (a statement on a federal order is
    correctly skipped). Orders without the governor's initials are noted, not stored.

- [ ] **A4. Texas Senate Journal** (Goodwin, from 2027-01-19)
  - Why: nothing is read from the Senate Journal. The office's recorded actions there, such as a
    tie-breaking vote or a vote in the Committee of the Whole, would not be loaded.
  - Source: Texas Senate Journal (`journals.senate.texas.gov`) and Texas Legislature Online.
  - Done when: a run finds and stores any recorded vote by the presiding officer, linked to the
    Journal page.
  - **Status (code done, waits on Jan. 19):** Sync reads every Senate Journal day of the term and
    stores any roll call where "Mr. President" or "Madam President" is in the Yeas or Nays
    (`senate_journal.ts`). Live check on the 89th: **121 days, 3,695 roll calls, 1,578 with name
    lists, 1,578 of 1,578 lists matching their tallies, 0 presiding-officer votes** (correct). On
    the 76th-83rd it finds exactly the **3** presiding-officer votes that a text search of all
    1,571 day files found (HB 587, SB 1074, SB 488 in 2001).

- [ ] **A5. Check the senator's sources once he is seated** (Talarico, from 2027-01-03)
  - Why: Congress.gov and Senate votes have never returned data, because he is "not listed as a
    current member yet" and has "not taken office yet". The code expects the 120th Congress,
    session 1 (`vote_menu_120_1.xml`). That path has never been tested against real data.
  - Done when: the first January run shows `congress_sponsored` and `senate_votes` in its counts
    with no errors, and the rows link to congress.gov and senate.gov.
  - **Status (code ready, waits on Jan. 3 and two IDs):** The session math is tested (2027 ->
    120th Congress, session 1). Votes are matched on `lis_member_id`; live check on the 40 latest
    roll calls of the 119th Congress, session 2, using a sitting Texas senator's ID: **40 of 40
    matched** (28 yea, 9 nay, 3 not voting). Still open: add `bioguide_id` and `lis_member_id`
    for Talarico once Congress.gov and senate.gov list him; each run notes them until then.

## B. Campaign money for the state offices

- [ ] **B1. Texas Ethics Commission campaign finance** (Hinojosa, Goodwin, Herbert)
  - Why: only the senator's money is loaded, from the FEC. The three state offices show nothing.
  - Source: Texas Ethics Commission campaign finance reports. Confirm the exact export (search
    results or bulk download) before building.
  - Done when: each state official has a summary and itemized contributions, each linked to the
    TEC report it came from, shown the same way as the FEC data.
  - **Status (code done and proven on live data; summaries finish over the next daily runs):** Sync
    reads the TEC's daily bulk export by byte range: `cover.csv` for each report's totals, then only
    the contribs files that hold each official's reports (`tec.ts`). Rows are added up per report
    (itemized total, Texas total, employers, 100 largest gifts), then per cycle into
    `tx_contribution_summaries` and `tx_contributions`, each gift linked to its TEC report PDF.
    - Live check: `cover.csv` (197 MB) gives 90 reports for the 3 filers; Hinojosa's 8-day report
      is 229,722 rows and **$17,655,048.91 itemized, equal to its cover sheet to the cent**
      ($8,285,860.79 from Texas).
    - Live run: **9 of 9 fully read reports match their cover sheets to the cent** (Goodwin and
      Hinojosa, 45 to 141,908 rows each). A 10th is half read, as expected: its rows continue in a
      file not read yet.
    - Still open: the TEC's CDN refused byte ranges (403) after about 70 requests in the first run
      and about 17 in a catch-up. Sync now keeps the zip directory, reads each file in one request,
      and makes at most 15 requests per run. The remaining files (about 15) are read over the next
      daily runs; the summaries are written when an official's files are all read. Check
      `tx_contribution_summaries` for the three state officials after those runs.

- [x] **B2. Choose the FEC cycle after the election**
  - Why: `cycleFor()` takes the year of `election_date` (2026), so Sync keeps reading the 2026
    cycle for the whole term. Fundraising for the next Senate election would never load.
  - Done when: there is a written rule for which cycle(s) to load, and the code follows it.
  - **Status (done):** The rule: load the cycle of the election the official won, plus every cycle
    after it up to the one that holds today (`fecCycles` in `federal.ts`, written in SYNC.md).
    2026 winner: 2026 now, 2026 and 2028 in 2027-2028, through 2032. Unit tested. TEC uses the
    same rule.

## C. How often Sync runs and how much it covers

- [ ] **C1. Nothing runs Sync on a schedule**
  - Why: Sync runs only when a visitor clicks the button, and no cron is set up in the repo.
    Three things depend on regular runs:
    - Watched-bill actions are queued only if they are 30 days old or newer, so a quiet month
      loses them.
    - The page queue moves only 80 pages per run.
    - Senate votes catch up only 40 per run.
  - Decide first: a scheduled run uses the same 24-hour slot, so it would block the button for a
    day. Options are a schedule that replaces the button, or one that runs only when nobody
    clicked that day.
  - Done when: a run starts every day without a click, and `ingest_runs` shows it.
  - **Status (done; first scheduled run tonight if nobody syncs):** One run per calendar day in
    Central time. `tx_claim_sync` now refuses only a second run on the same CT day, and pg_cron job
    `tx_nightly_sync` (`30 4,5 * * *` UTC) starts a run at 11:30 pm CT if none started that day.
    `ingest_runs.triggered_by` shows `button` or `schedule`. Checked: the job is active, and
    called during the day it answers "skipped: not 11 pm in Central time". Unit tests cover the day
    rule across the daylight-time switch. Today's run was started by the button, so the first
    scheduled run is the first day nobody presses it.

- [x] **C2. Clear the campaign-page backlog**
  - Why: 411 of 491 pages have never been read. At 80 pages a run, that takes about six more
    runs.
  - Options: C1 alone, or raise `MAX_PAGES_PER_RUN` and the time budget if the Edge Function's
    limits allow. The last run took 29 seconds.
  - Done when: no row in `tx_watched_pages` has an empty `last_checked_at`.
  - **Status (done):** Pages are read in batches of 100, each in its own request, until every page
    is read. Live run: **491 pages checked, 411 new or changed, 0 rows with an empty
    `last_checked_at`** (411 before). Reading every page showed that a site's menu label
    ("Cannabis & THC") became a finding on each of 233 pages; the sweep now skips matches of fewer
    than five words and queues a passage once per official and topic. Those 258 copies were
    dismissed with a note, leaving 27 distinct passages for review.

- [ ] **C3. X posts are never checked**
  - Why: all four officials have an X account on file, but `tx_private_settings` has no
    `x_bearer_token`. Every run notes "X posts were not checked."
  - Decide first: whether to get X API access (it is paid) or drop X from the topic sweep and the
    copy.
  - Done when: a run shows `topic_posts_checked` in its counts, or X is removed and the notes say
    so.
  - **Status (waits on you):** You chose to keep X and add a token. The code is unchanged and runs
    as soon as `tx_private_settings.x_bearer_token` is stored; until then each run notes it.

- [x] **C4. Page through all Congress.gov results**
  - Why: sponsored and co-sponsored bills are read once with `limit=250` and no next page. Over a
    six-year term, co-sponsorships can pass 250, and the rest would be cut off without warning.
  - Done when: Sync follows `pagination.next` until every bill is read.
  - **Status (done):** `allPages` follows `pagination.next` (adding the key back, which Congress.gov
    leaves out) until the last page. Live check: a sitting Texas senator's sponsored bills,
    **1,649 read of 1,649 listed** (the old code read 250). Unit tested.

- [x] **C5. Keep the Senate vote backlog when a session ends**
  - Why: Sync reads only the current year's session and takes up to 40 new votes per run. Votes
    from the old session that are still waiting at the turn of the year are never fetched.
  - Done when: Sync finishes the previous session before moving to the new one, or reads both
    until the old one is done.
  - **Status (done):** `senateSessions` returns the previous session first, then the current one,
    and a batch with roll calls left asks to be run again. Unit tested at the turn of 2028 and
    2029.

## D. Matching the right person

- [x] **D1. Store each official's IDs instead of matching on last name**
  - Why: each of these sources matches on the last name only:
    - FEC searches by last name and takes the first name that contains it.
    - Congress.gov does the same.
    - Senate votes match last name plus "TX".

    A second candidate or member with the same last name would attach someone else's record.
  - Fix: add `fec_candidate_id`, `bioguide_id`, and the Senate `lis_member_id` to `politicians`.
    Fill them from the sources by hand once, and match on them.
  - Done when: no source lookup depends on the last name.
  - **Status (done):** `politicians` has `fec_candidate_id`, `bioguide_id`, `lis_member_id` and
    `tec_filer_id`, and every lookup uses them. No source searches by name any more (`grep` finds
    no last-name lookups). Why it mattered, from the live check: Congress.gov's Texas members whose
    name contains "cruz" are **De La Cruz, Monica** and **Cruz, Ted**, and the old code took the
    first. Filled: Talarico's FEC ID `S6TX00479` (verified: principal committee C00919084,
    Talarico for Texas) and the three TEC filer IDs. `bioguide_id` and `lis_member_id` do not
    exist until he is seated (see A5).

## E. Showing what Sync did

- [x] **E1. Show the run notes and failed sources on the site**
  - Why: the notes saved with each run never reach the page. That includes "not automated yet",
    "X posts were not checked", and "pages wait for the next run". The "Last run results" panel
    also shows only how many sources failed, not which ones.
  - Done when: "Last run results" lists the notes and each failed source with its message, in both
    light and dark mode.
  - **Status (done):** "Last run results" lists every failed source with its message and every
    run note, and says when the nightly schedule started the run. Unit tested; checked in the
    browser in light and dark mode on `/how-we-track`.

- [x] **E2. Keep the "not automated" notes in sync with the code**
  - Why: the notes for `governor`, `tx_lt_governor`, and `tx_house` are fixed strings in
    `supabase/functions/tx_sync/index.ts`. When an item in section A ships, the note will keep
    saying it is not automated unless someone remembers to edit it.
  - Done when: the note comes from the same list of sources that runs, so they cannot disagree.
  - **Status (done):** The notes come from the registry in `sources.ts`, the same list that decides
    what runs. A source with `run: null` is named in the notes for exactly the offices it covers
    (unit tested). Every registered source now runs, so no "not automated" notes remain; the live
    run's notes confirm it.

- [x] **E3. Review the 10 findings waiting in `tx_topic_findings`**
  - Why: they are keyword matches on campaign pages. None becomes a promise until a person checks
    the verbatim quote and the source.
  - Done when: each one is confirmed as a promise or dismissed.
  - **Status (done):** All 10 still matched their pages word for word (checked 2026-11-09). With
    your approval: **4 promoted**, each linked to the existing promise with the same quote and page;
    **6 dismissed** (a statement about an opponent, a petition request, and 4 past actions), each
    with a review note. The live run then queued 27 new distinct passages (see C2); they are new
    work for the review queue.

## F. Edits made by hand

- [x] **F1. Stop Congress.gov runs from undoing hand edits**
  - Why: Congress.gov rows are upserted on every run. That rewrites `title`, `acted_on`, and the
    source fields from Congress.gov.
  - Not affected: `promise_id` and `what_it_does` are not sent, so a link to a promise stays. House
    Journal votes are insert-only and are never overwritten.
  - Decide: whether those Congress.gov fields should refresh from the source, or stay as edited.
  - Done when: the chosen behavior is in the code and noted in SYNC.md.
  - **Status (done):** You chose to keep the upsert so a bill stays current. Rows now also carry
    Congress.gov's latest action in `result` (for example "Became Public Law No: 120-3.
    (2027-05-01)"), so they follow the bill until it is enacted or dies. `promise_id` and
    `what_it_does` are never sent, so hand-added links and explanations are kept. A bill without an
    introduced date is skipped and noted instead of being dated today. Written in SYNC.md; unit
    tested.
