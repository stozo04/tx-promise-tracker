// Live check for Sync's parsers: reads the real primary sources (no database, no writes) and prints
// statistics that show each SYNC-CHECKLIST.md fix works on real data. Run from the repo root:
//
//   deno run --allow-net --allow-env=DATA_GOV_KEY --node-modules-dir=none scripts/sync-live-check.ts [section ...]
//
// Sections: house tlo governor senate congress fec tec events (all by default). Congress.gov and FEC use
// api.data.gov's public DEMO_KEY unless DATA_GOV_KEY is set, so keep repeat runs light.
import { mobilizeEvents, mobilizeOrganization, squarespaceEvents, squarespacePast } from "../supabase/functions/tx_sync/events_campaign.ts";
import { LAWS, type LawKey, lawText, legalEvents, verifiedLaws } from "../supabase/functions/tx_sync/events_law.ts";
import { parseFloorSchedule, parseSenateHearings, parseTentativeSchedule, SENATE_FLOOR_SCHEDULE, SENATE_HEARINGS, SENATE_MEMBERS, senateScheduleUrl, senatorCommittees } from "../supabase/functions/tx_sync/events_senate.ts";
import { memberCommittees, parseCalendarFeed, parseMeetingFeed, TLO_RSS } from "../supabase/functions/tx_sync/events_texas.ts";
import { allPages, menuVotes, senateVoteRow } from "../supabase/functions/tx_sync/federal.ts";
import { executiveOrdersIn, GOVERNOR_REPORTS, governorActionDate, parseArchivePosts } from "../supabase/functions/tx_sync/governor.ts";
import { JOURNAL_API, parseJournalDays, positionOf, recordVotesInDay } from "../supabase/functions/tx_sync/journal.ts";
import { parseSenateRollCalls, presidingVote } from "../supabase/functions/tx_sync/senate_journal.ts";
import { centralDate, http } from "../supabase/functions/tx_sync/shared.ts";
import { coverRow, partBuilder } from "../supabase/functions/tx_sync/tec.ts";
import { csvReader, entryText, grepLines, listZip } from "../supabase/functions/tx_sync/tec_zip.ts";
import { parseAuthorReport, parseReportRows } from "../supabase/functions/tx_sync/texas.ts";

const KEY = `api_key=${Deno.env.get("DATA_GOV_KEY") ?? "DEMO_KEY"}`;
const wanted = new Set(Deno.args.length ? Deno.args : ["house", "tlo", "governor", "senate", "congress", "fec", "tec", "events"]);

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

if (wanted.has("house")) {
  // A1: every record vote of the 89th Legislature, checked against a full roll of members.
  const days = parseJournalDays(await http.json(`${JOURNAL_API}/journals-for-legislature/89/H`), "H");
  const members = [["Goodwin", 0], ["Hinojosa", 0], ["Talarico", 0]] as [string, number][];
  let votes = 0;
  const totals = new Map<number, number>();
  await pool(days, 4, async (day) => {
    const res = await http.text(day.htmlUrl, 90_000);
    if (!res.ok) throw new Error(`${res.status} ${day.htmlUrl}`);
    for (const vote of recordVotesInDay(res.text)) {
      votes++;
      const n = Object.values(vote.lists).flat().length;
      totals.set(n, (totals.get(n) ?? 0) + 1);
      for (const m of members) if (positionOf(vote, m[0])) m[1]++;
    }
  });
  console.log("A1 House Journal, 89th Legislature:", { journal_days: days.length, record_votes: votes, members_listed_per_vote: Object.fromEntries([...totals].sort((a, b) => b[1] - a[1])), found_per_member: Object.fromEntries(members) });
}

if (wanted.has("tlo")) {
  // A2: authored, joint-authored and co-authored bills against the counts each report prints.
  for (const [name, code] of [["Goodwin", "A3820"], ["Talarico", "A3685"], ["Hinojosa", "A3210"]]) {
    for (const session of ["89R", "88R"]) {
      const a = (await http.text(`https://capitol.texas.gov/Reports/Report.aspx?LegSess=${session}&ID=author&Code=${code}`, 60_000)).text;
      const c = (await http.text(`https://capitol.texas.gov/Reports/Report.aspx?LegSess=${session}&ID=coauthor&Code=${code}`, 60_000)).text;
      const printed = (html: string) => Number(html.match(/Number of Bills:\s*([\d,]+)/)?.[1].replace(",", "") ?? 0);
      console.log(`A2 ${name} ${session}: author report ${parseAuthorReport(a, "author").length}/${printed(a)} parsed/printed, coauthor report ${parseAuthorReport(c, "coauthor").length}/${printed(c)}`);
    }
  }
}

if (wanted.has("governor")) {
  // A3: governor reports against their printed counts, signing dates from bill histories, and
  // executive orders found by their PDF in the months that hold GA-55, GA-56 and GA-57.
  for (const report of GOVERNOR_REPORTS) {
    const html = (await http.text(`https://capitol.texas.gov/Reports/Report.aspx?LegSess=89R&ID=${report.id}`, 90_000)).text;
    const rows = parseReportRows(html);
    const printed = Number(html.match(/Number of Bills:\s*([\d,]+)/)?.[1].replace(",", "") ?? 0);
    const sample = rows.slice(0, 25);
    const dated = await pool(sample, 3, async (row) =>
      governorActionDate((await http.text(`https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=${row.bill.replace(" ", "")}`, 30_000)).text, report.action));
    console.log(`A3 89R ${report.id}: ${rows.length}/${printed} parsed/printed; action date found in history for ${dated.filter(Boolean).length}/${sample.length} sampled bills`);
  }
  const orders: string[] = [];
  let posts = 0;
  for (const month of ["2025/01", "2025/02", "2025/09", "2026/07"]) {
    const list = parseArchivePosts((await http.text(`https://gov.texas.gov/news/archive/${month}`)).text, Number(month.slice(0, 4)));
    posts += list.length;
    const found = await pool([...list].reverse(), 3, async (post) => ({ post, orders: executiveOrdersIn((await http.text(post.url, 30_000)).text) }));
    for (const { post, orders: inPost } of found) for (const order of inPost) if (!orders.some((o) => o.startsWith(`${order.number} `))) orders.push(`${order.number} ${post.date}`);
  }
  console.log(`A3 executive orders: ${posts} posts read in 4 months; orders found: ${orders.join(", ") || "none"}`);
}

if (wanted.has("senate")) {
  // A4: every Senate Journal day of the 89th Legislature; list lengths against tallies.
  const days = parseJournalDays(await http.json(`${JOURNAL_API}/journals-for-legislature/89/S`), "S");
  let calls = 0, printed = 0, agree = 0, president = 0;
  await pool(days, 4, async (day) => {
    for (const c of parseSenateRollCalls((await http.text(day.htmlUrl, 90_000)).text)) {
      calls++;
      if (presidingVote(c)) president++;
      if (c.lists.yea.length + c.lists.nay.length === 0) continue;
      printed++;
      if ((!c.lists.yea.length || c.lists.yea.length === c.tally.yea) && (!c.lists.nay.length || c.lists.nay.length === c.tally.nay)) agree++;
    }
  });
  console.log("A4 Senate Journal, 89th Legislature:", { journal_days: days.length, roll_calls: calls, with_name_lists: printed, lists_match_tally: agree, presiding_officer_votes: president });
}

if (wanted.has("congress")) {
  // C4 and D1: a long list read to the end, and why last-name matching is unsafe.
  const sponsored = await allPages<unknown>(http, `https://api.congress.gov/v3/member/C001056/sponsored-legislation?limit=250&format=json&${KEY}`, "sponsoredLegislation", KEY);
  const first = (await http.json(`https://api.congress.gov/v3/member/C001056/sponsored-legislation?limit=1&format=json&${KEY}`)) as { pagination: { count: number } };
  console.log(`C4 Congress.gov, John Cornyn (C001056) sponsored bills: ${sponsored.length} read, ${first.pagination.count} listed (the old code read 250)`);
  const members = ((await http.json(`https://api.congress.gov/v3/member/TX?currentMember=true&limit=250&format=json&${KEY}`)) as { members: { name: string; bioguideId: string }[] }).members;
  console.log(`D1 Texas members whose name contains "cruz": ${members.filter((m) => m.name.toLowerCase().includes("cruz")).map((m) => `${m.name} (${m.bioguideId})`).join("; ")}. The old code took the first.`);
  // A5 and D1: Senate votes matched by lis_member_id on real 119th Congress roll calls.
  const menu = menuVotes((await http.text("https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml")).text).slice(0, 40);
  const rows = await pool(menu, 4, async (vote) => {
    const xml = (await http.text(`https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_${vote.number.padStart(5, "0")}.xml`)).text;
    return senateVoteRow(xml, { congress: 119, session: 2 }, vote.number, "x", "S287", vote.title, vote.result);
  });
  const positions = rows.reduce<Record<string, number>>((m, r) => ({ ...m, [String(r?.position ?? "not listed")]: (m[String(r?.position ?? "not listed")] ?? 0) + 1 }), {});
  console.log(`A5/D1 Senate roll calls 119-2, 40 latest, matched by lis_member_id S287:`, positions);
}

if (wanted.has("fec")) {
  // D1: the stored FEC candidate ID resolves to the right committee.
  const c = ((await http.json(`https://api.open.fec.gov/v1/candidate/S6TX00479/?${KEY}`)) as { results: { name: string }[] }).results[0];
  const committee = ((await http.json(`https://api.open.fec.gov/v1/candidate/S6TX00479/committees/?designation=P&${KEY}`)) as { results: { committee_id: string; name: string }[] }).results[0];
  console.log(`D1 FEC S6TX00479: ${c.name}, principal committee ${committee?.committee_id} (${committee?.name})`);
}

if (wanted.has("tec")) {
  // B1: cover sheets and one contribs file from the TEC zip, by byte range.
  const zip = await listZip();
  console.log(`B1 TEC zip: ${zip.entries.length} files, built ${zip.lastModified}`);
  const filers = [",00080440,", ",00081436,", ",00089964,"];
  const cover = zip.entries.find((e) => e.name === "cover.csv")!;
  const reports: ReturnType<typeof coverRow>[] = [];
  let read: ((line: string) => Record<string, string>) | null = null;
  let t = performance.now();
  await grepLines(await entryText(zip.url, cover), filers, (line, header) => {
    read ??= csvReader(header);
    reports.push(coverRow(read(line)));
  });
  console.log(`B1 cover.csv (${(cover.size / 1e6).toFixed(0)} MB): ${reports.length} reports for the 3 filers in ${Math.round(performance.now() - t)} ms`);
  const last = zip.entries.filter((e) => /^contribs_\d+\.csv$/.test(e.name)).sort((a, b) => Number(b.name.match(/\d+/)![0]) - Number(a.name.match(/\d+/)![0]))[0];
  const builder = partBuilder();
  read = null;
  t = performance.now();
  await grepLines(await entryText(zip.url, last), filers, (line, header) => {
    read ??= csvReader(header);
    builder.add(read(line));
  });
  for (const part of builder.rows(last.name)) {
    const report = reports.find((r) => r?.report_id === part.report_id);
    const itemizedOnCover = report && report.total_contrib !== null ? Math.round(((report.total_contrib ?? 0) - (report.unitemized_contrib ?? 0)) * 100) / 100 : null;
    console.log(`B1 ${last.name} report ${part.report_id} (filer ${part.filer_ident}): ${part.rows} rows, itemized ${part.itemized_total} (cover sheet: ${itemizedOnCover}), TX ${part.in_state_total}`);
  }
  console.log(`B1 ${last.name} (${(last.size / 1e6).toFixed(0)} MB) read in ${Math.round(performance.now() - t)} ms`);
}

if (wanted.has("events")) {
  // G: every event source. Counts are compared with what the page itself lists (its <item>s,
  // <meeting>s or events), and a sample of each is printed. Requests go one at a time.
  const items = (xml: string, re: RegExp) => [...xml.matchAll(re)].length;
  const placeholder = (xml: string) => /No (committee meetings scheduled|calendars are available)/i.test(xml) ? 1 : 0;
  for (const type of ["upcomingmeetingshouse", "upcomingmeetingssenate", "upcomingmeetingsjoint"]) {
    const xml = (await http.text(`${TLO_RSS}${type}`)).text;
    const meetings = parseMeetingFeed(xml);
    console.log(`G1 TLO ${type}: ${meetings.length} parsed / ${items(xml, /<item>/g) - placeholder(xml)} listed`, meetings[0] ?? "(none listed)");
  }
  const member = memberCommittees((await http.text("https://capitol.texas.gov/Members/MemberInfo.aspx?Leg=89&Chamber=H&Code=A3820")).text);
  console.log(`G1 TLO member page (89th, A3820): ${member.length} committees`, member.map((c) => `${c.code} ${c.name}`));
  for (const [type, chamber] of [["upcomingcalendarshouse", "H"], ["upcomingcalendarssenate", "S"]] as const) {
    const xml = (await http.text(`${TLO_RSS}${type}`)).text;
    const days = parseCalendarFeed(xml, chamber);
    console.log(`G2 TLO ${type}: ${days.reduce((n, d) => n + d.documents.length, 0)} documents parsed / ${items(xml, /<item>/g) - placeholder(xml)} listed, ${days.length} floor days`, days[0] ?? "(none listed)");
  }
  const floor = parseFloorSchedule((await http.text(SENATE_FLOOR_SCHEDULE)).text);
  console.log("G3 Senate floor schedule, next meeting:", floor);
  for (const year of [2026, 2027]) {
    const res = await http.text(senateScheduleUrl(year));
    const xml = res.text.includes("<schedule>") ? res.text : "";
    console.log(`G3 Senate tentative ${year} schedule: ${xml ? `${parseTentativeSchedule(xml).length} parsed / ${items(xml, /<beginDate>/g)} listed` : "not published"}`);
  }
  const hearingsXml = (await http.text(SENATE_HEARINGS)).text;
  const hearings = parseSenateHearings(hearingsXml);
  const members = (await http.text(SENATE_MEMBERS)).text;
  const cornyn = senatorCommittees(members, "C001056") ?? [];
  console.log(`G4 Senate hearings: ${hearings.length} parsed / ${items(hearingsXml, /<identifier>/g)} listed; ${items(members, /<senator /g)} senators in member data; C001056 sits on ${cornyn.length} committees, ${hearings.filter((h) => cornyn.some((c) => c.code === h.code)).length} of the hearings`, hearings[0]);
  const texts: Partial<Record<LawKey, string>> = {};
  const fetched = new Map<string, string>();
  for (const key of Object.keys(LAWS) as LawKey[]) {
    const url = LAWS[key].fetch;
    if (!fetched.has(url)) fetched.set(url, lawText((await http.text(url, 30_000)).text));
    texts[key] = fetched.get(url);
  }
  const verified = verifiedLaws(texts);
  console.log(`G5 law texts: ${verified.size}/${Object.keys(LAWS).length} rules found word for word`, [...verified]);
  const today = centralDate(new Date());
  for (const [office, start] of [["tx_house", "2027-01-12"], ["tx_lt_governor", "2027-01-19"], ["governor", "2027-01-19"], ["us_senate", "2027-01-03"]]) {
    console.log(`G5 ${office}:`, legalEvents(office, today, verified, start).map((d) => `${d.starts_on} ${d.title} [${d.legal_basis}]`));
  }
  const goodwin = await http.json("https://www.vikkigoodwin.com/events?format=json");
  console.log(`G6 vikkigoodwin.com/events: ${squarespaceEvents(goodwin, "https://www.vikkigoodwin.com").length} upcoming, ${squarespacePast(goodwin, "https://www.vikkigoodwin.com").length} past on the first page`);
  for (const slug of ["ginahinojosafortexasgovernor", "talaricofortexas", "zach4texas"]) {
    const org = mobilizeOrganization((await http.text(`https://www.mobilize.us/${slug}/`)).text);
    const json = (await http.json(`https://api.mobilize.us/v1/organizations/${org}/events?timeslot_start=gte_now&per_page=100`)) as { data: { sponsor: { id: number } }[] };
    console.log(`G6 mobilize.us/${slug} (org ${org}): ${json.data.length} upcoming listed, ${json.data.filter((e) => e.sponsor.id === org).length} hosted by the campaign, ${mobilizeEvents(json, org!).length} time slots kept`);
  }
}
