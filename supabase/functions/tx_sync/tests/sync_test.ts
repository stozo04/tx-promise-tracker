// Unit tests for Sync, one block per SYNC-CHECKLIST.md item. Fixtures in ./fixtures are real pages
// and files from the primary sources, saved on 2026-11-09. Run: deno test --allow-read (see README).
import { assert, assertEquals, assertExists } from "jsr:@std/assert@1";

import { congressBillUrl, congressOn, ordinal as ordinalSuffix, sourceHref, unloadedSources } from "../../../../lib/event-sources.ts";
import { cooldownRemaining, nextCentralMidnight, runErrors, runNotes, syncSummary } from "../../../../lib/sync.ts";
import { allPages, congressBillRow, fecCycles, menuVotes, MAX_VOTES_PER_SYNC, nextPageUrl, senateSessions, senateVoteRow } from "../federal.ts";
import { executiveOrdersIn, GOVERNOR_REPORTS, governorActionDate, monthsSince, ordersPrefix, parseArchivePosts } from "../governor.ts";
import { officeContext, parseJournalDays, positionOf, recordVotesInDay } from "../journal.ts";
import { parseSenateRollCalls, presidingVote } from "../senate_journal.ts";
import { appearanceDraft, mobilizeEvents, mobilizeOrganization, squarespaceEvents, squarespacePast } from "../events_campaign.ts";
import { clockTime, forOfficial, saveEvents, zonedTime } from "../events.ts";
import { type LawKey, lawText, legalEvents, regularSession, secondTuesdayOfJanuary, verifiedLaws } from "../events_law.ts";
import { floorDraft as senateFloorDraft, hearingDraft, parseFloorSchedule, parseSenateHearings, parseTentativeSchedule, senatorCommittees } from "../events_senate.ts";
import { calendarDoc, checkFeed, feedNotes, floorDraft, meetingDraft, meetingOf, memberCommittees, parseCalendarFeed, parseMeetingFeed, texasFloor } from "../events_texas.ts";
import { centralDate, type Ctx, type Http, type Log, mergeLog, texasLegislature } from "../shared.ts";
import { isStatement } from "../topics.ts";
import { notAutomatedNotes, SOURCES, sourcesFor } from "../sources.ts";
import { coverRow, filesForReport, partBuilder, reportCycle, summarize, tecReportUrl, type TecReport } from "../tec.ts";
import { csvReader } from "../tec_zip.ts";
import { authorDate, houseVoteRows, parseAuthorReport, parseReportRows, tloSessions } from "../texas.ts";

const fixture = (name: string) => Deno.readTextFile(new URL(`./fixtures/${name}`, import.meta.url));

// --- A1. Every House record vote on a journal day, for the member's journal name.

Deno.test("A1: the journal web service lists every day of the 89th Legislature, both sessions", async () => {
  const days = parseJournalDays(JSON.parse(await fixture("journals_89_H.json")), "H");
  assertEquals(days.length, 98 + 15 + 24);
  assertEquals(days[0].htmlUrl, "https://journals.house.texas.gov/HJRNL/89R/HTML/89RDAY01FINAL.HTM");
  assertEquals(days[0].session, "89R");
  assert(days.some((d) => d.session === "892"));
});

Deno.test("A1: every record vote on a House Journal day is found, and each one lists all 150 members", async () => {
  const votes = recordVotesInDay(await fixture("house_journal_89RDAY40FINAL.htm"));
  assertEquals(votes.map((v) => v.record), ["78", "79", "80", "81", "82", "83", "84", "85", "86", "87", "88"]);
  for (const vote of votes) assertEquals(Object.values(vote.lists).flat().length, 150, `Record ${vote.record}`);
  assertEquals(votes[0].bill, "SB 14");
  assertEquals(votes[4].bill, "HB 12"); // "CSHB 12" is the committee substitute for HB 12.
});

Deno.test("A1: rows for one member link to the Journal day page and carry the office held", async () => {
  const html = await fixture("house_journal_89RDAY40FINAL.htm");
  const day = { session: "89R", date: "2025-04-09", htmlUrl: "https://journals.house.texas.gov/HJRNL/89R/HTML/89RDAY40FINAL.HTM" };
  const rows = houseVoteRows(html, day, { id: "p1", slug: "vikki-goodwin" }, { journal_name: "Goodwin", district: "47" });
  assertEquals(rows.length, 11);
  for (const row of rows) {
    assertEquals(row.source_url, day.htmlUrl);
    assertEquals(row.office_context, "Texas House, District 47 (89th Legislature)");
    assert(["yea", "nay", "present", "absent"].includes(row.position as string));
  }
  assertEquals(rows[0].external_id, "house:89R:78:vikki-goodwin");
  // A name that is not on the roll is never matched to anyone.
  assertEquals(houseVoteRows(html, day, { id: "p2", slug: "x" }, { journal_name: "Nobody", district: "1" }).length, 0);
});

Deno.test("A1: the legislature follows the calendar (89th in 2026, 90th from 2027)", () => {
  assertEquals(texasLegislature(new Date("2026-11-09T12:00:00Z")), 89);
  assertEquals(texasLegislature(new Date("2027-01-12T18:00:00Z")), 90);
  assertEquals(texasLegislature(new Date("2028-12-31T12:00:00Z")), 90);
  assertEquals(officeContext("112", "901"), "Texas House, District 112 (90th Legislature, 1st called session)");
});

// --- A2. Authored and co-authored bills from Texas Legislature Online.

Deno.test("A2: the author report parses to the counts the report prints (86 authored, 11 joint)", async () => {
  const html = await fixture("tlo_author_89R_A3820.html");
  const bills = parseAuthorReport(html, "author");
  assertEquals(bills.filter((b) => b.role === "author").length, Number(html.match(/Author \((\d+)\)/)![1]));
  assertEquals(bills.filter((b) => b.role === "joint_author").length, Number(html.match(/Joint Author \((\d+)\)/)![1]));
  assertEquals(bills.length, Number(html.match(/Number of Bills: (\d+)/)![1]));
  assertEquals(bills[0].bill, "HB 203");
  assert(bills[0].caption.startsWith("Relating to a limitation on increases in the appraised value"));
});

Deno.test("A2: the coauthor report parses to its printed count (53)", async () => {
  const html = await fixture("tlo_coauthor_89R_A3820.html");
  const bills = parseAuthorReport(html, "coauthor");
  assertEquals(bills.length, Number(html.match(/Number of Bills: (\d+)/)![1]));
  assert(bills.every((b) => b.role === "coauthor"));
});

Deno.test("A2: the date a member signed on comes from the bill's Authors page", async () => {
  assertEquals(authorDate(await fixture("tlo_authors_88R_HB3535.html"), "Goodwin", "coauthor"), "2023-04-10");
  assertEquals(authorDate(await fixture("tlo_authors_89R_HB865.html"), "Goodwin", "joint_author"), "2025-04-30");
  assertEquals(authorDate(await fixture("tlo_authors_88R_HB3535.html"), "Goodwin", "author"), null);
});

Deno.test("A2: session codes for a legislature come from TLO's own list", async () => {
  const html = await fixture("tlo_billsby.html");
  assertEquals(tloSessions(html, 89), ["892", "891", "89R"]);
  assertEquals(tloSessions(html, 90), ["90R"]);
});

// --- A3. Governor's actions.

Deno.test("A3: the vetoed-by-the-governor report parses to its printed count", async () => {
  const html = await fixture("tlo_vetoedbygov_89R.html");
  const rows = parseReportRows(html);
  assertEquals(rows.length, Number(html.match(/Number of Bills:\s*([\d,]+)/)![1].replace(",", "")));
  assert(rows.every((r) => /^(HB|SB|HCR|SCR|HJR|SJR) \d+$/.test(r.bill)));
});

Deno.test("A3: the signing date comes from the bill history, not the report's last action", async () => {
  const signed = GOVERNOR_REPORTS.find((r) => r.kind === "signed")!;
  assertEquals(governorActionDate(await fixture("tlo_history_89R_HB2.html"), signed.action), "2025-06-20");
});

Deno.test("A3: executive orders are found by the order's PDF, not by words in a title", () => {
  const order = executiveOrdersIn(
    '<a href="https://lnks.gd/l/x?url=https%3A%2F%2Fgov.texas.gov%2Fuploads%2Ffiles%2Fpress%2FEO-GA-55_Prohibiting_Govt_Race_Discrim_IMAGE_2024-01-31.pdf">here</a>',
  );
  assertEquals(order, [{ number: "GA-55", pdfUrl: "https://gov.texas.gov/uploads/files/press/EO-GA-55_Prohibiting_Govt_Race_Discrim_IMAGE_2024-01-31.pdf" }]);
  assertEquals(executiveOrdersIn("<p>Statement on the President's executive order</p>"), []);
  // One post can publish two orders; each is found once.
  const two = executiveOrdersIn(
    '<a href="https://gov.texas.gov/uploads/files/press/EO-GA-53_a.pdf">x</a><a href="https://gov.texas.gov/uploads/files/press/EO-GA-54_b.pdf">y</a><a href="https://gov.texas.gov/uploads/files/press/EO-GA-54_b.pdf">z</a>',
  );
  assertEquals(two.map((o) => o.number), ["GA-53", "GA-54"]);
  // Orders carry the governor's initials, so a predecessor's order linked from a post is not stored.
  assertEquals(ordersPrefix("Greg Abbott"), "GA");
  assertEquals(ordersPrefix("Gina Hinojosa"), "GH");
});

Deno.test("A3: the governor's monthly archive lists every post with its date", async () => {
  const posts = parseArchivePosts(await fixture("gov_news_archive_2026-07.html"), 2026);
  assertEquals(posts.length, 68);
  const birth = posts.find((p) => p.url.endsWith("governor-abbott-issues-executive-order-cracking-down-on-birth-tourism-schemes"));
  assertEquals(birth?.date, "2026-07-21");
  assertEquals(monthsSince("2027-01-19", new Date("2027-03-02T00:00:00Z")), ["2027/01", "2027/02", "2027/03"]);
});

// --- A4. The Texas Senate Journal.

Deno.test("A4: a vote by the presiding officer ('Mr. President' in the Yeas) is found", async () => {
  const calls = parseSenateRollCalls(await fixture("senate_journal_77R_5-7.htm"));
  const voted = calls.filter((c) => presidingVote(c));
  assertEquals(voted.length, 1);
  assertEquals(presidingVote(voted[0]), "yea");
  assertEquals(voted[0].bill, "HB 587");
});

Deno.test("A4: on an 89th day every printed list matches its tally, and the presiding officer cast no vote", async () => {
  const calls = parseSenateRollCalls(await fixture("senate_journal_89RSJ04-10-F.htm"));
  assert(calls.length > 0);
  for (const c of calls) {
    if (c.lists.yea.length) assertEquals(c.lists.yea.length, c.tally.yea);
    if (c.lists.nay.length) assertEquals(c.lists.nay.length, c.tally.nay);
    assertEquals(presidingVote(c), null);
  }
});

// --- A5 and C5. Senate roll calls: the right session, the previous session first, matched by ID.

Deno.test("A5: the first session of the senator's term is the 120th Congress, session 1", () => {
  assertEquals(senateSessions(new Date("2027-01-04T12:00:00Z"), "2027-01-03"), [{ congress: 120, session: 1 }]);
});

Deno.test("C5: at the turn of the year the previous session is read first, then the new one", () => {
  assertEquals(senateSessions(new Date("2028-01-05T12:00:00Z"), "2027-01-03"), [
    { congress: 120, session: 1 },
    { congress: 120, session: 2 },
  ]);
  assertEquals(senateSessions(new Date("2029-01-05T12:00:00Z"), "2027-01-03"), [
    { congress: 120, session: 2 },
    { congress: 121, session: 1 },
  ]);
  assertEquals(MAX_VOTES_PER_SYNC, 40);
});

Deno.test("D1/A5: a Senate vote is matched on lis_member_id, never on a last name", async () => {
  const xml = await fixture("senate_vote_119_2_00001.xml");
  const s = { congress: 119, session: 2 as const };
  const row = senateVoteRow(xml, s, "00001", "p1", "S287", null, null);
  assertExists(row);
  assertEquals(row.position, "yea");
  assertEquals(row.acted_on, "2026-01-05");
  assertEquals(row.source_url, "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00001.htm");
  assertEquals(senateVoteRow(xml.replaceAll("<lis_member_id>S287</lis_member_id>", ""), s, "00001", "p1", "S287", null, null), null);
  // Another member's last name never matters: only the ID does.
  assertEquals(senateVoteRow(xml.replace("<last_name>Cornyn</last_name>", "<last_name>Someone</last_name>"), s, "00001", "p1", "S287", null, null)?.position, "yea");
  assertEquals(menuVotes(await fixture("senate_menu_119_2.xml")).map((v) => v.number), ["00256", "00255", "00254", "00253", "00252"]);
});

// --- B1. Texas Ethics Commission.

Deno.test("B1: cover rows become reports, and replaced reports are marked", async () => {
  const text = await fixture("tec_cover_3filers.csv");
  const [header, ...lines] = text.trim().split("\n");
  const read = csvReader(header);
  const reports = lines.map((line) => coverRow(read(line))).filter((r): r is TecReport => r !== null);
  assertEquals(reports.length, lines.length);
  const replaced = reports.find((r) => r.report_id === 101072652);
  assertEquals(replaced?.info_only, true);
  const hinojosa8day = reports.find((r) => r.report_id === 101073400)!;
  assertEquals(hinojosa8day.total_contrib, 17659893.91);
  assertEquals(hinojosa8day.unitemized_contrib, 4845);
  assertEquals(reportCycle(hinojosa8day), 2026);
  assertEquals(tecReportUrl(101073400, hinojosa8day.received_on), "https://prd.tecprd.ethicsefile.com/public/cf/2026/pdfs/ScrubbedReport_101073400.PDF");
});

Deno.test("B1: contribution rows add up per report, with in-state totals and the largest gifts", async () => {
  const text = await fixture("tec_contribs_sample.csv");
  const [header, ...lines] = text.trim().split("\n");
  const read = csvReader(header);
  const builder = partBuilder();
  let total = 0;
  let tx = 0;
  for (const line of lines) {
    const row = read(line);
    builder.add(row);
    if (row.recordType === "RCPT" && row.infoOnlyFlag !== "Y") {
      total += Number(row.contributionAmount);
      if (row.contributorStreetStateCd === "TX") tx += Number(row.contributionAmount);
    }
  }
  const parts = builder.rows("contribs_113.csv");
  const sum = (key: "itemized_total" | "in_state_total") => parts.reduce((s, p) => s + p[key], 0);
  assertEquals(Math.round(sum("itemized_total") * 100), Math.round(total * 100));
  assertEquals(Math.round(sum("in_state_total") * 100), Math.round(tx * 100));
  for (const part of parts) {
    assert(part.top_gifts.length <= 100);
    for (let i = 1; i < part.top_gifts.length; i++) assert(part.top_gifts[i - 1].amount >= part.top_gifts[i].amount);
  }
});

Deno.test("B1: a report is looked for by the day it was received: the file that starts before it, and files that start that day", () => {
  // Real first-row dates (contribs_95 starts 2026-01-09, contribs_111 starts 2026-10-05). Report IDs
  // are NOT in file order (contribs_106 starts with a lower ID than contribs_104), dates are.
  const files = [
    { name: "contribs_95.csv", first: "2026-01-09" },
    { name: "contribs_110.csv", first: "2026-10-01" },
    { name: "contribs_111.csv", first: "2026-10-05" },
    { name: "contribs_112.csv", first: "2026-10-26" },
    { name: "contribs_113.csv", first: "2026-10-26" },
  ];
  assertEquals(filesForReport(files, "2026-10-06"), ["contribs_111.csv"]);
  assertEquals(filesForReport(files, "2026-10-26"), ["contribs_111.csv", "contribs_112.csv", "contribs_113.csv"]);
  assertEquals(filesForReport(files, "2025-07-15"), []);
});

Deno.test("B1: a cycle's summary leaves out replaced reports and links the latest report", () => {
  const base = { filer_ident: "00080440", report_type: "X", period_start: null, cash_on_hand: null };
  const reports: TecReport[] = [
    { ...base, report_id: 1, received_on: "2026-01-15", period_end: "2025-12-31", total_contrib: 100, unitemized_contrib: 10, info_only: false },
    { ...base, report_id: 2, received_on: "2026-10-26", period_end: "2026-10-24", total_contrib: 500, unitemized_contrib: 50, info_only: true },
    { ...base, report_id: 3, received_on: "2026-10-29", period_end: "2026-10-24", total_contrib: 600, unitemized_contrib: 60, info_only: false },
    { ...base, report_id: 4, received_on: "2024-07-15", period_end: "2024-06-30", total_contrib: 999, unitemized_contrib: 0, info_only: false },
  ];
  const gift = (id: string, report: number, amount: number) => ({ id, report_id: report, name: id, city: null, state: "TX", employer: null, amount, date: null });
  const parts: { report_id: number; itemized_total: number; in_state_total: number; employers: Record<string, number>; top_gifts: ReturnType<typeof gift>[] }[] = [
    { report_id: 1, itemized_total: 90, in_state_total: 45, employers: { ACME: 50 }, top_gifts: [gift("a", 1, 50)] },
    { report_id: 2, itemized_total: 450, in_state_total: 400, employers: { ACME: 400 }, top_gifts: [gift("b", 2, 400)] },
    { report_id: 3, itemized_total: 540, in_state_total: 270, employers: { ACME: 100, BETA: 300 }, top_gifts: [gift("c", 3, 300)] },
  ];
  const result = summarize("p1", 2026, reports, parts)!;
  assertEquals(result.summary.receipts, 700);
  assertEquals(result.summary.individual_unitemized, 70);
  assertEquals(result.summary.state_itemized_total, 630);
  assertEquals(result.summary.in_state_itemized, 315);
  assertEquals(result.summary.top_employers, [{ employer: "BETA", total: 300 }, { employer: "ACME", total: 150 }]);
  assertEquals(result.summary.source_url, tecReportUrl(3, "2026-10-29"));
  assertEquals(result.gifts.map((g) => g.external_id), ["tec:c", "tec:a"]);
  assertEquals(summarize("p1", 2030, reports, parts), null);
});

// --- B2. FEC cycles after the election.

Deno.test("B2: the FEC cycle rule loads the winning cycle and every cycle after it", () => {
  assertEquals(fecCycles("2026-11-03", new Date("2026-11-09T00:00:00Z")), [2026]);
  assertEquals(fecCycles("2026-11-03", new Date("2027-03-01T00:00:00Z")), [2026, 2028]);
  assertEquals(fecCycles("2026-11-03", new Date("2032-10-01T00:00:00Z")), [2026, 2028, 2030, 2032]);
  assertEquals(fecCycles("2026-11-03", new Date("2026-05-01T00:00:00Z")), [2026]);
});

// --- C1. One run per calendar day in Central time.

Deno.test("C1: a run earlier today blocks until midnight CT; a run yesterday does not", () => {
  const now = Date.parse("2026-11-09T20:00:00Z"); // 2:00 pm CST
  assertEquals(cooldownRemaining("2026-11-09T14:41:00Z", now), Date.parse("2026-11-10T06:00:00Z") - now);
  // 11:45 pm CT yesterday: a 24-hour rule would block until 11:45 pm tonight, the day rule does not.
  assertEquals(cooldownRemaining("2026-11-09T05:45:00Z", now), 0);
  assertEquals(cooldownRemaining(null, now), 0);
});

Deno.test("C1: midnight CT is found across the daylight-time switch", () => {
  assertEquals(nextCentralMidnight(Date.parse("2026-07-01T20:00:00Z")), Date.parse("2026-07-02T05:00:00Z"));
  assertEquals(nextCentralMidnight(Date.parse("2026-11-01T03:00:00Z")), Date.parse("2026-11-01T05:00:00Z"));
  assertEquals(nextCentralMidnight(Date.parse("2026-11-01T20:00:00Z")), Date.parse("2026-11-02T06:00:00Z"));
  assertEquals(centralDate(new Date("2026-11-10T05:30:00Z")), "2026-11-09"); // 11:30 pm CT
});

// --- C4. Congress.gov pagination.

Deno.test("C4: Congress.gov lists are read to the last page, with the key added back", async () => {
  const pages: Record<string, unknown> = {
    "https://api.congress.gov/v3/member/X/sponsored-legislation?limit=2&api_key=K": {
      sponsoredLegislation: [{ number: "1" }, { number: "2" }],
      pagination: { count: 5, next: "https://api.congress.gov/v3/member/X/sponsored-legislation?offset=2&limit=2" },
    },
    "https://api.congress.gov/v3/member/X/sponsored-legislation?offset=2&limit=2&api_key=K": {
      sponsoredLegislation: [{ number: "3" }, { number: "4" }],
      pagination: { count: 5, next: "https://api.congress.gov/v3/member/X/sponsored-legislation?offset=4&limit=2" },
    },
    "https://api.congress.gov/v3/member/X/sponsored-legislation?offset=4&limit=2&api_key=K": {
      sponsoredLegislation: [{ number: "5" }],
      pagination: { count: 5 },
    },
  };
  const http: Http = {
    json: (url) => (url in pages ? Promise.resolve(pages[url]) : Promise.reject(new Error(`unexpected ${url}`))),
    text: () => Promise.reject(new Error("unused")),
  };
  const items = await allPages<{ number: string }>(http, "https://api.congress.gov/v3/member/X/sponsored-legislation?limit=2&api_key=K", "sponsoredLegislation", "api_key=K");
  assertEquals(items.map((i) => i.number), ["1", "2", "3", "4", "5"]);
  assertEquals(nextPageUrl({ pagination: { next: "https://a/b?offset=2&api_key=K" } }, "api_key=K"), "https://a/b?offset=2&api_key=K");
});

// --- F1. Congress.gov rows follow the bill: title and latest action refresh, hand fields are kept.

Deno.test("F1: a Congress.gov row carries the latest action and never sends hand-edited fields", () => {
  const row = congressBillRow("p1", "sponsored", {
    congress: 120,
    type: "S",
    number: "12",
    title: "A bill",
    introducedDate: "2027-02-01",
    latestAction: { actionDate: "2027-05-01", text: "Became Public Law No: 120-3." },
  })!;
  assertEquals(row.result, "Became Public Law No: 120-3. (2027-05-01)");
  assertEquals(row.acted_on, "2027-02-01");
  assertEquals(row.source_url, "https://www.congress.gov/bill/120th-congress/senate-bill/12");
  assert(!("promise_id" in row) && !("what_it_does" in row));
  // No introduced date: skipped, never dated "today".
  assertEquals(congressBillRow("p1", "sponsored", { congress: 120, type: "S", number: "13" }), null);
});

// --- E1. The run's notes and failed sources reach the page.

Deno.test("E1: the summary carries every failed source and every note", () => {
  const summary = syncSummary({
    politicians: [{ id: "p1", slug: "a", name: "A" }],
    topics: [{ code: "t", label: "T", active: true }],
    topicFindings: [],
    ingestRuns: [
      {
        source_type: "tx_sync",
        started_at: "2026-11-09T20:00:00Z",
        finished_at: "2026-11-09T20:03:00Z",
        counts: { topic_pages_checked: 3 },
        errors: [{ source: "tec:gina-hinojosa", message: "403 from the TEC" }, "odd"],
        notes: "Started by the public Sync button\nTopics: X posts were not checked.\n\nHouse Journal: 4 days wait.",
        triggered_by: "schedule",
      },
    ],
  });
  assertEquals(summary.lastRun?.errors, [
    { source: "tec:gina-hinojosa", message: "403 from the TEC" },
    { source: "unknown source", message: '"odd"' },
  ]);
  assertEquals(summary.lastRun?.notes, ["Topics: X posts were not checked.", "House Journal: 4 days wait."]);
  assertEquals(summary.lastRun?.triggeredBy, "schedule");
  assertEquals(runErrors([]), []);
  assertEquals(runNotes(null), []);
});

// --- E2. "Not automated" notes come from the same registry that decides what runs.

Deno.test("E2: every office's sources come from the registry, and all of them run", () => {
  for (const office of ["us_senate", "governor", "tx_lt_governor", "tx_house"]) assert(sourcesFor(office).length > 0, office);
  assertEquals(SOURCES.filter((s) => s.run === null), []);
  assertEquals(notAutomatedNotes([{ name: "A", office: "governor" }]), []);
});

Deno.test("E2: a source without a run is named in the notes for exactly the offices it covers", () => {
  const sources = [
    { key: "a", label: "Source A", offices: ["governor"], run: null },
    { key: "b", label: "Source B", offices: ["governor", "tx_house"], run: null },
    { key: "c", label: "Source C", offices: ["governor"], run: () => Promise.resolve() },
  ];
  assertEquals(notAutomatedNotes([{ name: "Gov", office: "governor" }, { name: "Rep", office: "tx_house" }, { name: "Sen", office: "us_senate" }], sources), [
    "Gov: Source A and Source B are not automated yet. Their records are added by hand.",
    "Rep: Source B is not automated yet. Their records are added by hand.",
  ]);
});

// --- C2. Reading every page must not flood the review queue with a site's menu.

Deno.test("C2: a menu label is not a statement; a sentence is", () => {
  assertEquals(isStatement("Cannabis & THC"), false);
  assertEquals(isStatement("Legalize it! Houston THC Rally"), true);
  assertEquals(isStatement("As governor, Gina will fight to give the people of Texas a direct right to vote on the future of THC."), true);
});

// --- The staged run adds every stage's log into one.

Deno.test("Stages: logs merge, nested counts add up, and notes are not repeated", () => {
  const into: Log = { counts: { a: 1, topic_matches: { x: { t: 1 } } }, errors: [], notes: ["n"] };
  mergeLog(into, { counts: { a: 2, b: 0, topic_matches: { x: { t: 2 }, y: { t: 1 } } }, errors: [{ source: "s", message: "m" }], notes: ["n", "o"] });
  assertEquals(into.counts, { a: 3, b: 0, topic_matches: { x: { t: 3 }, y: { t: 1 } } });
  assertEquals(into.errors.length, 1);
  assertEquals(into.notes, ["n", "o"]);
  assertEquals(positionOf({ record: "1", question: "", result: null, bill: null, lists: { yea: ["Goodwin"] } }, "Goodwin"), "yea");
});

// --- G. Events (tx_upcoming_events). Every source on pages saved from it; TLO feeds with meetings in
// them were saved by the Internet Archive during the 88th Legislature (the live feeds are empty
// between sessions, as the 2026-11-09 copies show).

const count = (text: string, re: RegExp) => [...text.matchAll(re)].length;

Deno.test("G1: every House committee meeting in TLO's feed is read, with its date, time, room and committee code", async () => {
  const xml = await fixture("tlo_rss_meetings_house_2023-03-27.xml");
  const meetings = parseMeetingFeed(xml);
  assertEquals(meetings.length, count(xml, /<item>/g));
  assertEquals(meetings.length, 34);
  assertEquals(meetings[0], {
    session: "88R",
    committeeCode: "C410",
    committee: "Public Health",
    date: "2023-03-27",
    time: "08:00",
    timeText: "8:00 AM",
    location: "E2.036",
    url: "https://capitol.texas.gov/tlodocs/88R/schedules/html/C4102023032708001.htm",
    noticeId: "C4102023032708001",
    cancelled: false,
  });
  // Every meeting's date in the title matches the date in the notice's address.
  for (const m of meetings) assert(m.url.includes(m.date.replaceAll("-", "")), m.url);
  // "2:30 PM or upon final adjourn." keeps its condition in the details; the clock time is 2:30 PM Central.
  const ag = meetingDraft(meetings.find((m) => m.committeeCode === "C020" && m.date === "2023-03-27")!, "House");
  assertEquals(ag.starts_at, "2023-03-27T19:30:00.000Z");
  assert(ag.details!.includes("2:30 PM or upon final adjourn./recess"));
  assertEquals(ag.title, "House Committee on Agriculture & Livestock");
  assertEquals(ag.event_key, "tlo_hearing:88R:C020:2023-03-27:14301");
  // The Senate feed has the same shape.
  const senate = await fixture("tlo_rss_meetings_senate_2023-05-19.xml");
  assertEquals(parseMeetingFeed(senate).length, count(senate, /<item>/g));
  // The live feed between sessions says "No committee meetings scheduled." and yields none.
  assertEquals(parseMeetingFeed(await fixture("tlo_rss_meetings_house_2026-11-09.xml")), []);
});

Deno.test("G1: committee membership comes from the member's TLO page, by committee code", async () => {
  assertEquals(memberCommittees(await fixture("tlo_member_89_A3820.html")), [
    { session: "89R", code: "C030", name: "Appropriations" },
    { session: "89R", code: "C012", name: "Appropriations - S/C on Article III" },
    { session: "89R", code: "C320", name: "Insurance" },
  ]);
  // Only meetings of those committees match: none of the 34 meetings on 2023-03-27 was Appropriations or Insurance.
  const meetings = parseMeetingFeed(await fixture("tlo_rss_meetings_house_2023-03-27.xml"));
  assertEquals(meetings.filter((m) => ["C030", "C012", "C320"].includes(m.committeeCode)).map((m) => `${m.committee} ${m.date}`), ["Insurance 2023-03-28"]);
});

Deno.test("G2: House and Senate floor calendars are read one event per chamber per day", async () => {
  const house = await fixture("tlo_rss_calendars_house_2023-05-19.xml");
  const days = parseCalendarFeed(house, "H");
  assertEquals(days.map((d) => d.date), ["2023-05-18", "2023-05-19", "2023-05-20"]);
  // Every document in the feed is kept with its day.
  assertEquals(days.reduce((n, d) => n + d.documents.length, 0), count(house, /<item>/g));
  const row = floorDraft(days[0]);
  assertEquals(row.kind, "floor_vote");
  assertEquals(row.source_url, "https://capitol.texas.gov/tlodocs/88R/calendars/html/H120230518.htm");
  assertEquals(row.event_key, "tlo_calendar:88R:H:2023-05-18");
  assertEquals(row.starts_at, undefined); // The calendar gives no time, so none is shown.
  const senate = parseCalendarFeed(await fixture("tlo_rss_calendars_senate_2023-05-19.xml"), "S");
  assertEquals(senate.map((d) => [d.date, d.documents.length]), [["2023-05-18", 6], ["2023-05-19", 2]]);
  assertEquals(floorDraft(senate[0]).source_name, "Texas Legislature Online: Notice of Intent");
  assertEquals(parseCalendarFeed(await fixture("tlo_rss_calendars_house_2026-11-09.xml"), "H"), []);
});

Deno.test("G2: TLO's \"nothing posted\" item is no event, in every feed the live site served on 2026-11-09 and 2026-11-10", async () => {
  const feeds = [
    ["tlo_rss_calendars_house_2026-11-09.xml", "No calendars are available."],
    ["tlo_rss_calendars_senate_2026-11-10.xml", "No calendars are available."],
    ["tlo_rss_meetings_house_2026-11-09.xml", "No committee meetings scheduled."],
    ["tlo_rss_meetings_senate_2026-11-10.xml", "No committee meetings scheduled."],
    ["tlo_rss_meetings_joint_2026-11-10.xml", "No committee meetings scheduled."],
  ];
  for (const [file, title] of feeds) {
    const xml = await fixture(file);
    const reads = file.includes("calendars") ? (item: Parameters<typeof meetingOf>[0]) => calendarDoc(item, file.includes("senate") ? "S" : "H") !== null : (item: Parameters<typeof meetingOf>[0]) => meetingOf(item) !== null;
    assertEquals(checkFeed(xml, reads), { listed: 1, nothingPosted: title, unrecognized: [] }, file);
    assertEquals(file.includes("calendars") ? parseCalendarFeed(xml, file.includes("senate") ? "S" : "H") : parseMeetingFeed(xml), [], file);
  }
  // The run note names the feed, what it said, the TLO page, and that the live format is unconfirmed.
  const check = checkFeed(await fixture("tlo_rss_calendars_house_2026-11-09.xml"), (item) => calendarDoc(item, "H") !== null);
  const [note] = feedNotes("upcomingcalendarshouse", check, "House calendars");
  assert(note.includes('the upcomingcalendarshouse feed says "No calendars are available."'));
  assert(note.includes("https://capitol.texas.gov/Calendars/CalendarsHouse.aspx"));
  assert(note.includes("current item format is unconfirmed"));
});

Deno.test("G2: every item of the populated 88th Legislature feeds is read, and an item in another format is reported, not loaded", async () => {
  for (const [file, chamber] of [["tlo_rss_calendars_house_2023-05-19.xml", "H"], ["tlo_rss_calendars_senate_2023-05-19.xml", "S"]] as const) {
    const check = checkFeed(await fixture(file), (item) => calendarDoc(item, chamber) !== null);
    assertEquals([check.nothingPosted, check.unrecognized], [null, []], file);
  }
  for (const file of ["tlo_rss_meetings_house_2023-03-27.xml", "tlo_rss_meetings_senate_2023-05-19.xml"]) {
    const check = checkFeed(await fixture(file), (item) => meetingOf(item) !== null);
    assertEquals([check.nothingPosted, check.unrecognized], [null, []], file);
  }
  // One calendar moved to an address the parser does not know: it is counted and named, never guessed at.
  const house = await fixture("tlo_rss_calendars_house_2023-05-19.xml");
  const moved = house.replace("<link>https://capitol.texas.gov/tlodocs/88R/calendars/html/H120230518.htm</link>", "<link>https://capitol.texas.gov/Calendars/Calendar.aspx?id=1</link>");
  const check = checkFeed(moved, (item) => calendarDoc(item, "H") !== null);
  assertEquals(check.unrecognized.map((item) => item.title), ["Daily House Calendar - 5/18/2023"]);
  const notes = feedNotes("upcomingcalendarshouse", check, "House calendars");
  assertEquals(notes.length, 1);
  assert(notes[0].includes(`1 of ${count(house, /<item>/g)} items are not in the format the parser reads`));
  // An error page served with 200 is never read as an empty feed.
  let threw = false;
  try {
    checkFeed("<html><body>Service unavailable</body></html>", () => true);
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test("G2: Sync on the live House calendars feed between sessions writes no event and notes why", async () => {
  const p = { id: "p1", slug: "zach-herbert", name: "Zach Herbert", office: "tx_house", term_start: "2027-01-12" };
  const stored = forOfficial({ kind: "floor_vote", title: "Texas House floor calendar", starts_on: "2027-02-03", source_name: "TLO", source_url: "u", event_key: "tlo_calendar:90R:H:2027-02-03" }, p);
  const run = async (feed: string) => {
    const { db, written } = fakeEventsDb([{ ...stored, status: "scheduled" }]);
    const log: Log = { counts: {}, errors: [], notes: [] };
    const http = { text: () => Promise.resolve({ ok: true, status: 200, text: feed }) } as unknown as Http;
    await texasFloor({ db, log, http, now: new Date("2026-11-10T18:00:00Z") } as unknown as Ctx, p as never);
    return { written, log };
  };
  const empty = await run(await fixture("tlo_rss_calendars_house_2026-11-09.xml"));
  assertEquals(empty.written, []);
  assert(empty.log.notes.some((note) => note.includes("posts no upcoming House calendars") && note.includes("unconfirmed")));
  // The feed lists nothing, so the stored 2027-02-03 calendar is noted as no longer listed, and left as is.
  assert(empty.log.notes.some((note) => note.includes("no longer listed (Texas House floor calendar, 2027-02-03)")));
  // A feed with an item in an unknown format is not the whole list: nothing is noted as no longer listed.
  const odd = (await fixture("tlo_rss_calendars_house_2026-11-09.xml")).replace(
    /<item>.*<\/item>/,
    "<item><title>Daily House Calendar - 2/3/2027</title><link>https://capitol.texas.gov/Calendars/Calendar.aspx?id=1</link></item>",
  );
  const unknown = await run(odd);
  assertEquals(unknown.written, []);
  assert(unknown.log.notes.some((note) => note.includes("1 of 1 items are not in the format the parser reads")));
  assertEquals(unknown.log.notes.some((note) => note.includes("no longer listed")), false);
});

Deno.test("G3: the Senate floor schedule's next meeting is read, and Eastern time becomes Central", async () => {
  const next = parseFloorSchedule(await fixture("senate_floor_schedule_2026-11-09.htm"))!;
  assertEquals(next, { date: "2026-11-09", text: "Convene at 3:00 p.m.", time: "15:00", timeText: "3:00 p.m." });
  const row = senateFloorDraft(next);
  assertEquals(row.starts_at, "2026-11-09T20:00:00.000Z"); // 3:00 p.m. EST
  assert(row.details!.includes("3:00 p.m. Eastern, 2:00 p.m. Central"));
  assertEquals(parseFloorSchedule("<p>no schedule</p>"), null);
});

Deno.test("G3: the Senate's tentative schedule lists every non-legislative period", async () => {
  const xml = await fixture("senate_2026_schedule.xml");
  const periods = parseTentativeSchedule(xml);
  assertEquals(periods.length, count(xml, /<beginDate>/g));
  assertEquals(periods.find((p) => p.begin === "2026-08-10"), { begin: "2026-08-10", end: "2026-09-11", action: "State Work Period", note: "Labor Day - Sep 7" });
});

Deno.test("G4: Senate hearings are read from senate.gov, matched to a senator's committees by bioguide ID only", async () => {
  const xml = await fixture("senate_hearings_2026-11-09.xml");
  const hearings = parseSenateHearings(xml);
  // Every <meeting> but the "No committee hearings scheduled" placeholder.
  assertEquals(hearings.length, count(xml, /<meeting>/g) - 1);
  const first = hearingDraft(hearings[0]);
  assertEquals(first.starts_at, "2026-11-10T14:30:00.000Z"); // 9:30 a.m. Eastern
  assertEquals(first.location, "SD-366, Washington, D.C.");
  assert(first.details!.includes("Scheduled for 9:30 AM Eastern (8:30 a.m. Central)"));
  const members = await fixture("senate_cvc_member_data_2026-11-09.xml");
  const cornyn = senatorCommittees(members, "C001056")!;
  assert(cornyn.some((c) => c.code === "SSFR00"));
  const theirs = hearings.filter((h) => cornyn.some((c) => c.code === h.code));
  assertEquals(theirs.map((h) => h.committee), ["Foreign Relations", "Finance", "Judiciary"]);
  assertEquals(senatorCommittees(members, "T000000"), null); // An ID not on the list matches nobody.
});

Deno.test("G5: dates set by law are computed only from the law's own text", async () => {
  const files: Record<LawKey, string> = {
    convene: "law_GV.301.htm",
    filing: "law_CN.3.htm",
    length: "law_CN.3.htm",
    veto: "law_CN.4.htm",
    installed: "law_CN.4.htm",
    ltGovernor: "law_CN.4.htm",
    senateTerm: "law_senate_constitution.htm",
  };
  const texts: Partial<Record<LawKey, string>> = {};
  for (const [key, file] of Object.entries(files)) texts[key as LawKey] = lawText(await fixture(file));
  const verified = verifiedLaws(texts);
  assertEquals(verified.size, 7);
  const dates = (office: string, start: string) => legalEvents(office, "2026-11-09", verified, start).map((d) => [d.starts_on, d.legal_basis, d.event_key]);
  assertEquals(dates("tx_house", "2027-01-12"), [
    ["2027-01-12", "Tex. Gov't Code §301.001", "law:90R:convene"],
    ["2027-03-12", "Tex. Const. art. 3, §5(b)", "law:90R:day60"],
    ["2027-05-31", "Tex. Const. art. 3, §24(b)", "law:90R:day140"],
  ]);
  assertEquals(dates("governor", "2027-01-19"), [
    ["2027-01-19", "Tex. Const. art. 4, §4", "law:90R:installed:governor"],
    ["2027-06-20", "Tex. Const. art. 4, §14; Tex. Const. art. 3, §24(b)", "law:90R:veto_period"],
  ]);
  assertEquals(dates("tx_lt_governor", "2027-01-19").map((d) => d[0]), ["2027-01-12", "2027-03-12", "2027-05-31", "2027-01-19"]);
  assertEquals(dates("us_senate", "2027-01-03"), [["2027-01-03", "U.S. Const. amend. XX, §1", "law:us_senate:term:2027-01-03"]]);
  // Noon Central on convening day; noon Eastern for the Senate term.
  assertEquals(legalEvents("tx_house", "2026-11-09", verified, "2027-01-12")[0].starts_at, "2027-01-12T18:00:00.000Z");
  assertEquals(legalEvents("us_senate", "2026-11-09", verified, "2027-01-03")[0].starts_at, "2027-01-03T17:00:00.000Z");
  // The 89th Legislature's published dates check the counting: convened 2025-01-14, 60th day 2025-03-14, 140th day 2025-06-02.
  assertEquals(secondTuesdayOfJanuary(2025), "2025-01-14");
  assertEquals(legalEvents("tx_house", "2025-01-01", verified, null).map((d) => d.starts_on), ["2025-01-14", "2025-03-14", "2025-06-02"]);
  // After the veto period ends, the next session's dates are the upcoming ones.
  assertEquals(regularSession("2027-06-20").convened, "2027-01-12");
  assertEquals(regularSession("2027-06-21").convened, "2029-01-09");
  // If the sentence a rule depends on changes, its dates are not loaded.
  const changed = verifiedLaws({ ...texts, convene: texts.convene!.replace("second Tuesday", "third Tuesday") });
  assertEquals(legalEvents("tx_house", "2026-11-09", changed, "2027-01-12"), []);
});

Deno.test("G6: a Squarespace events page is read as its own JSON; only upcoming events, and times to the minute", async () => {
  const json = JSON.parse(await fixture("campaign_vikkigoodwin_events.json"));
  assertEquals(squarespaceEvents(json, "https://www.vikkigoodwin.com"), []); // Nothing upcoming after the election.
  const past = squarespacePast(json, "https://www.vikkigoodwin.com");
  assertEquals(past.length, json.past.length);
  assertEquals(past[0].title, "Election Night Party - Austin");
  assertEquals(past[0].startsAt, "2026-11-04T00:30:00.000Z"); // 6:30 PM Central on November 3, as the page says.
  assertEquals(past[0].location, "Hyatt Regency, 208 Barton Springs Road, Austin, Texas, 78704");
  const row = appearanceDraft(past[0], "vikkigoodwin.com", "campaign:vikkigoodwin.com");
  assertEquals([row.starts_on, row.kind, row.is_campaign, row.source_url], ["2026-11-03", "appearance", true, "https://www.vikkigoodwin.com/events/nov3"]);
});

Deno.test("G6: a Mobilize page keeps only events the campaign itself hosts", async () => {
  const org = mobilizeOrganization(await fixture("mobilize_ginahinojosafortexasgovernor.html"));
  assertEquals(org, 46544);
  const json = JSON.parse(await fixture("mobilize_api_46544.json"));
  assertEquals(json.data.length, 4);
  // All four upcoming events on the campaign's page are hosted by party organizations, not the campaign.
  assertEquals(mobilizeEvents(json, org!), []);
  // The same events, read for the organization that hosts them, are one row per time slot.
  const party = mobilizeEvents(json, 370);
  assertEquals(party.length, json.data.filter((e: { sponsor: { id: number } }) => e.sponsor.id === 370).reduce((n: number, e: { timeslots: unknown[] }) => n + e.timeslots.length, 0));
});

Deno.test("G7: time helpers convert wall-clock times across daylight time", () => {
  assertEquals(zonedTime("2027-01-12", "12:00", "America/Chicago"), "2027-01-12T18:00:00.000Z");
  assertEquals(zonedTime("2027-07-12", "12:00", "America/Chicago"), "2027-07-12T17:00:00.000Z");
  assertEquals(zonedTime("2026-11-10", "09:30", "America/New_York"), "2026-11-10T14:30:00.000Z");
  assertEquals(clockTime("2:30 PM or upon final adjourn."), "14:30");
  assertEquals(clockTime("12:00 p.m."), "12:00");
  assertEquals(clockTime("12:15 AM"), "00:15");
  assertEquals(clockTime("Upon adjournment"), null);
});

/** A stand-in for the tx_upcoming_events table, enough for saveEvents. */
function fakeEventsDb(stored: Record<string, unknown>[]) {
  const written: Record<string, unknown>[][] = [];
  const db = {
    from: () => ({
      // Applies the filters saveEvents uses, so a test sees what the real query would return.
      select: () => {
        let rows = [...stored];
        const chain = {
          eq: (column: string, value: unknown) => ((rows = rows.filter((r) => r[column] === value)), chain),
          in: (column: string, values: unknown[]) => ((rows = rows.filter((r) => values.includes(r[column]))), chain),
          like: (column: string, pattern: string) => ((rows = rows.filter((r) => String(r[column]).startsWith(pattern.replace(/%$/, "")))), chain),
          gte: (column: string, value: string) => ((rows = rows.filter((r) => String(r[column]) >= value)), chain),
          then: (resolve: (result: { data: Record<string, unknown>[]; error: null }) => void) => resolve({ data: rows, error: null }),
        };
        return chain;
      },
      upsert: (rows: Record<string, unknown>[]) => {
        written.push(rows);
        return Promise.resolve({ error: null });
      },
    }),
  };
  return { db, written };
}

Deno.test("G8: events refresh: a changed time is updated and marked changed, a vanished event is noted, not deleted", async () => {
  const p = { id: "p1", slug: "x", name: "X" };
  const base = forOfficial({ kind: "committee_hearing", title: "House Committee on Insurance", starts_on: "2027-03-02", starts_at: "2027-03-02T14:00:00.000Z", source_name: "TLO", source_url: "u", event_key: "tlo_hearing:90R:C320:2027-03-02:08001" }, p);
  const gone = { ...base, external_id: "tlo_hearing:90R:C320:2027-03-09:08001:x", title: "House Committee on Insurance", starts_on: "2027-03-09" };
  const { db, written } = fakeEventsDb([{ ...base, status: "scheduled" }, { ...gone, status: "scheduled" }]);
  const log: Log = { counts: {}, errors: [], notes: [] };
  const ctx = { db, log, now: new Date("2027-03-01T12:00:00Z") } as unknown as Ctx;
  // Same row again: nothing is written.
  await saveEvents(ctx, p, "TLO", "tlo_hearing:", [base], { from: "2027-03-01", complete: false });
  assertEquals(written.length, 0);
  // The time moved: written with status changed and updated_at.
  await saveEvents(ctx, p, "TLO", "tlo_hearing:", [{ ...base, starts_at: "2027-03-02T15:30:00.000Z" }], { from: "2027-03-01", complete: true });
  assertEquals(written[0][0].status, "changed");
  assertEquals(written[0][0].updated_at, "2027-03-01T12:00:00.000Z");
  // The 2027-03-09 meeting is no longer listed: noted, never deleted or marked cancelled.
  assert(log.notes[0].includes("no longer listed (House Committee on Insurance, 2027-03-09)"));
  assertEquals(written.flat().some((row) => row.external_id === gone.external_id), false);
  // The source itself says cancelled: kept and marked cancelled.
  await saveEvents(ctx, p, "TLO", "tlo_hearing:", [{ ...base, status: "cancelled" }], { from: "2027-03-01", complete: false });
  assertEquals(written[1][0].status, "cancelled");
  assertEquals(log.counts.events_changed, 2);
});

Deno.test("G8: a past date set by law that is already stored is compared, not added again (Bugbot, PR #9)", async () => {
  const p = { id: "p1", slug: "zach-herbert", name: "Zach Herbert" };
  const verified = new Set<LawKey>(["convene", "filing", "length"]);
  // On 2027-02-01 the 90th session is in progress: its convening day (2027-01-12) is past but still emitted.
  const rows = legalEvents("tx_house", "2027-02-01", verified, "2027-01-12").map((d) => forOfficial(d, p));
  assertEquals(rows[0].starts_on, "2027-01-12");
  const { db, written } = fakeEventsDb(rows.map((row) => ({ ...row, status: "changed" })));
  const log: Log = { counts: {}, errors: [], notes: [] };
  const ctx = { db, log, now: new Date("2027-02-01T18:00:00Z") } as unknown as Ctx;
  await saveEvents(ctx, p, "Dates set by law", "law:", rows, { from: "2027-02-01", complete: false });
  // Nothing is re-added, nothing is rewritten, and a stored "changed" status is kept.
  assertEquals(written.length, 0);
  assertEquals(log.counts.events_added, 0);
  // On a first run mid-session the past date is stored once.
  const fresh = fakeEventsDb([]);
  await saveEvents({ ...ctx, db: fresh.db } as unknown as Ctx, p, "Dates set by law", "law:", rows, { from: "2027-02-01", complete: false });
  assertEquals(fresh.written[0].length, 3);
});

Deno.test("G9: \"Not loaded yet\" names each source that has none of its own events (Bugbot, PR #9)", () => {
  const all = ["us_senate", "governor", "tx_lt_governor", "tx_house"];
  // Only dates set by law are loaded: Texas session days and deadlines.
  const loaded = [
    { kind: "session_day", key: "law:90R:convene" },
    { kind: "deadline", key: "law:90R:day60" },
  ];
  const missing = unloadedSources(all, "all", loaded);
  // A Texas session day does not make the Senate floor schedule look loaded, nor a hearing source the other.
  assert(missing.includes("the U.S. Senate floor schedule and tentative schedule on senate.gov"));
  assert(missing.includes("Texas Legislature Online committee meeting notices"));
  assert(missing.includes("senate.gov committee hearing schedules"));
  assert(!missing.includes("the convening and 140th days from Tex. Gov't Code §301.001 and Tex. Const. art. 3"));
  assert(!missing.includes("dates the Texas Constitution, the Government Code and the U.S. Constitution set"));
  // A House hearing loads only the TLO source.
  const hearings = unloadedSources(all, "committee_hearing", [{ kind: "committee_hearing", key: "tlo_hearing:90R:C320:2027-03-02:08001" }]);
  assertEquals(hearings, ["senate.gov committee hearing schedules"]);
  // For the governor alone, only the governor's sources are named.
  assertEquals(unloadedSources(["governor"], "all", []), [
    "dates the Texas Constitution, the Government Code and the U.S. Constitution set",
    "each campaign's own events page",
  ]);
});

Deno.test("G9: House calendars and Senate calendars load apart, and the House calendars cite TLO's House Calendars page", () => {
  const offices = ["tx_house", "tx_lt_governor"];
  const house = [{ kind: "floor_vote", key: "tlo_calendar:90R:H:2027-02-03" }];
  assertEquals(unloadedSources(offices, "floor_vote", house), ["Texas Legislature Online Senate calendars"]);
  assertEquals(unloadedSources(offices, "floor_vote", [{ kind: "floor_vote", key: "tlo_calendar:90R:S:2027-02-03" }]), ["Texas Legislature Online House calendars"]);
  assertEquals(unloadedSources(["tx_house"], "floor_vote", []), ["Texas Legislature Online House calendars"]);
  assertEquals(sourceHref("Texas Legislature Online House calendars"), "https://capitol.texas.gov/Calendars/CalendarsHouse.aspx");
  assertEquals(sourceHref("Texas Legislature Online Senate calendars"), "https://capitol.texas.gov/Calendars/CalendarsSenate.aspx");
  assertEquals(sourceHref("each campaign's own events page"), null);
});

Deno.test("G10: every bill type a Senate hearing names links to Congress.gov with the right ordinal (Bugbot, PR #9)", () => {
  assertEquals(congressOn("2027-03-02"), 120);
  assertEquals(congressOn("2029-01-02"), 120); // A Congress starts on January 3.
  assertEquals(congressOn("2029-01-03"), 121);
  assertEquals(["1", "2", "3", "4", "11", "12", "13", "21", "101", "111", "121", "122", "123"].map((n) => ordinalSuffix(Number(n))), [
    "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "101st", "111th", "121st", "122nd", "123rd",
  ]);
  const at = "2029-03-01";
  assertEquals(congressBillUrl("S 12", at), "https://www.congress.gov/bill/121st-congress/senate-bill/12");
  assertEquals(congressBillUrl("HR 5", at), "https://www.congress.gov/bill/121st-congress/house-bill/5");
  assertEquals(congressBillUrl("H.R. 5", at), "https://www.congress.gov/bill/121st-congress/house-bill/5");
  assertEquals(congressBillUrl("HJRES 3", at), "https://www.congress.gov/bill/121st-congress/house-joint-resolution/3");
  assertEquals(congressBillUrl("SCONRES 7", at), "https://www.congress.gov/bill/121st-congress/senate-concurrent-resolution/7");
  assertEquals(congressBillUrl("HCONRES 8", at), "https://www.congress.gov/bill/121st-congress/house-concurrent-resolution/8");
  assertEquals(congressBillUrl("HRES 9", at), "https://www.congress.gov/bill/121st-congress/house-resolution/9");
  assertEquals(congressBillUrl("PN 1256", at), null); // A nomination is not a bill.
  // The parser keeps every bill type senate.gov lists, and normalizes "H.R." to "HR".
  const xml = (prefix: string) =>
    `<meeting><identifier>1</identifier><cmte_code>SSJU00</cmte_code><committee>Judiciary</committee><type>Open Hearing</type><date_iso_8601>2029-03-01</date_iso_8601><time>10:00 AM</time><Documents><AssociatedDocument congress="121" document_num="4" document_prefix="${prefix}"/></Documents><matter>x</matter></meeting>`;
  assertEquals(["HJRES", "SCONRES", "HCONRES", "HRES", "H.R.", "PN"].map((prefix) => parseSenateHearings(xml(prefix))[0].bills), [
    ["HJRES 4"], ["SCONRES 4"], ["HCONRES 4"], ["HRES 4"], ["HR 4"], [],
  ]);
});

Deno.test("E2: every event source is in the registry for the offices it serves", () => {
  const keys = (office: string) => sourcesFor(office).map((s) => s.key).filter((k) => k.startsWith("events_"));
  assertEquals(keys("tx_house"), ["events_law", "events_tx_floor", "events_tx_hearings", "events_campaign"]);
  assertEquals(keys("tx_lt_governor"), ["events_law", "events_tx_floor", "events_campaign"]);
  assertEquals(keys("governor"), ["events_law", "events_campaign"]);
  assertEquals(keys("us_senate"), ["events_law", "events_senate_floor", "events_senate_hearings", "events_campaign"]);
  assertEquals(centralDate(new Date("2027-01-12T18:00:00Z")), "2027-01-12");
});
