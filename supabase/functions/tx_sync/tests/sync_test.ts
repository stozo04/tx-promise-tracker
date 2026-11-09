// Unit tests for Sync, one block per SYNC-CHECKLIST.md item. Fixtures in ./fixtures are real pages
// and files from the primary sources, saved on 2026-11-09. Run: deno test --allow-read (see README).
import { assert, assertEquals, assertExists } from "jsr:@std/assert@1";

import { cooldownRemaining, nextCentralMidnight, runErrors, runNotes, syncSummary } from "../../../../lib/sync.ts";
import { allPages, congressBillRow, fecCycles, menuVotes, MAX_VOTES_PER_SYNC, nextPageUrl, senateSessions, senateVoteRow } from "../federal.ts";
import { executiveOrdersIn, GOVERNOR_REPORTS, governorActionDate, monthsSince, ordersPrefix, parseArchivePosts } from "../governor.ts";
import { officeContext, parseJournalDays, positionOf, recordVotesInDay } from "../journal.ts";
import { parseSenateRollCalls, presidingVote } from "../senate_journal.ts";
import { centralDate, type Http, type Log, mergeLog, texasLegislature } from "../shared.ts";
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
