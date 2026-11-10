// Texas Legislature Online events: the House and Senate floor calendars, and committee meetings of
// the committees an official sits on. Both come from TLO's own RSS feeds of upcoming items
// (capitol.texas.gov/MyTLO/RSS), which list every calendar and every posted meeting notice with a link
// to the document itself. Committee membership comes from the member's TLO page and is stored in
// tx_committee_memberships; a hearing is matched to an official only by committee code.
//
// The House calendars feed (Type=upcomingcalendarshouse) is the list behind "Calendars for upcoming
// dates" on TLO's House Calendars page (capitol.texas.gov/Calendars/CalendarsHouse.aspx); the Senate
// feed is the same list for the Senate.
import { clockTime, type EventDraft, eventsFrom, forOfficial, saveEvents, slashDate, tag, zonedTime } from "./events.ts";
import { type Ctx, decodeEntities, ordinal, type Politician, texasLegislature } from "./shared.ts";

export const TLO_RSS = "https://capitol.texas.gov/MyTLO/RSS/RSS.aspx?Type=";

/** The TLO pages a person reads the same lists on, cited in run notes and on the Events page. */
export const TLO_PAGES = {
  upcomingcalendarshouse: "https://capitol.texas.gov/Calendars/CalendarsHouse.aspx",
  upcomingcalendarssenate: "https://capitol.texas.gov/Calendars/CalendarsSenate.aspx",
  upcomingmeetingshouse: "https://capitol.texas.gov/Committees/MeetingsUpcoming.aspx?Chamber=H",
  upcomingmeetingssenate: "https://capitol.texas.gov/Committees/MeetingsUpcoming.aspx?Chamber=S",
  upcomingmeetingsjoint: "https://capitol.texas.gov/Committees/MeetingsUpcoming.aspx?Chamber=J",
} as const;

export type TloFeed = keyof typeof TLO_PAGES;

/**
 * The date a populated feed from the live site was saved as a test fixture, or null while none has
 * been. The parsers follow the populated feeds the Internet Archive saved during the 88th Legislature
 * (2023); every live feed checked since (2026-11-09, 2026-11-10) held only the "nothing posted" item.
 * Set this when a populated live feed is saved as a fixture and the tests pass on it.
 */
export const LIVE_POPULATED_FEED_SAVED: string | null = null;

export type RssItem = { title: string; link: string | null; description: string };

export function rssItems(xml: string): RssItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => ({
    title: decodeEntities(tag(m[1], "title") ?? "").trim(),
    link: tag(m[1], "link"),
    description: decodeEntities(tag(m[1], "description") ?? "").trim(),
  }));
}

/**
 * What each feed lists when nothing is posted: one item with this title, no <link>, and the HTML list
 * page as its <guid>. It means "no events", never an event.
 */
const NOTHING_POSTED = /^No (calendars are available|committee meetings scheduled)\.?$/i;

export type FeedCheck = {
  /** Items in the feed, the "nothing posted" item included. */
  listed: number;
  /** The "nothing posted" item's title, when the feed has it. */
  nothingPosted: string | null;
  /** Items that are neither the "nothing posted" item nor in the format the parser reads. */
  unrecognized: RssItem[];
};

/**
 * Sort a feed's items into the "nothing posted" item, items `reads` understands, and the rest. A
 * response that is not an RSS channel at all (an error page served with 200) throws, so it is never
 * mistaken for an empty feed.
 */
export function checkFeed(xml: string, reads: (item: RssItem) => boolean): FeedCheck {
  if (!/<rss[\s>]/i.test(xml) || !/<channel>/i.test(xml)) throw new Error("capitol.texas.gov did not return an RSS feed");
  const items = rssItems(xml);
  const nothingPosted = items.find((item) => !item.link && NOTHING_POSTED.test(item.title))?.title ?? null;
  return {
    listed: items.length,
    nothingPosted,
    unrecognized: items.filter((item) => !(nothingPosted && item.title === nothingPosted && !item.link) && !reads(item)),
  };
}

/** Run notes for one feed: what it said when nothing is posted, and any items in a format not seen before. */
export function feedNotes(type: TloFeed, check: FeedCheck, what: string): string[] {
  const notes: string[] = [];
  if (check.nothingPosted) {
    notes.push(
      `Texas Legislature Online posts no upcoming ${what} (the ${type} feed says "${check.nothingPosted}", ${TLO_PAGES[type]}).` +
        (LIVE_POPULATED_FEED_SAVED
          ? ""
          : " The parser follows populated feeds from the 88th Legislature (Internet Archive copies, 2023). No populated feed has been seen on the live site since, so its current item format is unconfirmed."),
    );
  }
  if (check.unrecognized.length > 0) {
    const first = check.unrecognized[0];
    notes.push(
      `Texas Legislature Online ${type} feed: ${check.unrecognized.length} of ${check.listed} items are not in the format the parser reads, so they were not loaded (first: "${first.title}"${first.link ? `, ${first.link}` : ""}). Save the live feed as a test fixture and update events_texas.ts (SYNC.md, "Events").`,
    );
  }
  return notes;
}

// --- Floor calendars.

export type FloorCalendar = { chamber: "H" | "S"; session: string; date: string; documents: { title: string; url: string }[] };

/** The documents that put bills before the full chamber; the others (amendment lists, referrals) are listed with them. */
const FLOOR_DOCS: Record<"H" | "S", RegExp> = {
  H: /^(Daily House Calendar|Supplemental House Calendar|Local, Consent, and Resolutions Calendar|Constitutional Amendments Calendar|Major State Calendar)/i,
  S: /^(Regular Order of Business|Notice of Intent|Intent Calendar|Local and Uncontested Calendar)/i,
};

/** One calendar document in a feed ("Daily House Calendar - 5/18/2023", linked to tlodocs/88R/calendars/html/H120230518.htm), or null. */
export function calendarDoc(item: RssItem, chamber: "H" | "S") {
  const match = item.link?.match(/\/tlodocs\/(\d{2}[R\d])\/calendars\/html\/([HS])[0-9A-Z](\d{4})(\d{2})(\d{2})\.htm$/i);
  const titled = item.title.match(/^(.*?)\s+-\s+(\d{1,2}\/\d{1,2}\/\d{4})$/);
  if (!match || !titled || match[2].toUpperCase() !== chamber) return null;
  const date = `${match[3]}-${match[4]}-${match[5]}`;
  if (slashDate(titled[2]) !== date) return null;
  return { session: match[1].toUpperCase(), date, title: titled[1], url: item.link! };
}

/** Upcoming calendars from a TLO feed, one entry per chamber per day. "No calendars are available." is none. */
export function parseCalendarFeed(xml: string, chamber: "H" | "S"): FloorCalendar[] {
  const byDay = new Map<string, FloorCalendar>();
  for (const item of rssItems(xml)) {
    const doc = calendarDoc(item, chamber);
    if (!doc) continue;
    const key = `${doc.session}:${doc.date}`;
    const day = byDay.get(key) ?? { chamber, session: doc.session, date: doc.date, documents: [] };
    day.documents.push({ title: doc.title, url: doc.url });
    byDay.set(key, day);
  }
  return [...byDay.values()].filter((day) => day.documents.some((doc) => FLOOR_DOCS[chamber].test(doc.title)));
}

export function floorDraft(day: FloorCalendar): EventDraft {
  const chamberName = day.chamber === "H" ? "Texas House" : "Texas Senate";
  const main = day.documents.find((doc) => FLOOR_DOCS[day.chamber].test(doc.title))!;
  return {
    kind: "floor_vote",
    title: `${chamberName} floor calendar`,
    starts_on: day.date,
    body: chamberName,
    location: "Texas State Capitol, Austin",
    details: `Calendars posted for this day: ${day.documents.map((doc) => doc.title).join("; ")}. Each lists the bills set for consideration by the full ${day.chamber === "H" ? "House" : "Senate"}.`,
    source_name: `Texas Legislature Online: ${main.title}`,
    source_url: main.url,
    event_key: `tlo_calendar:${day.session}:${day.chamber}:${day.date}`,
  };
}

/** Sync source: upcoming House floor calendars for the representative, Senate ones for the lieutenant governor. */
export async function texasFloor(ctx: Ctx, p: Politician) {
  const chamber = p.office === "tx_house" ? "H" : "S";
  const type = chamber === "H" ? "upcomingcalendarshouse" : "upcomingcalendarssenate";
  const res = await ctx.http.text(`${TLO_RSS}${type}`, 30_000);
  if (!res.ok) throw new Error(`${res.status} from capitol.texas.gov RSS ${type}`);
  const chamberName = chamber === "H" ? "House" : "Senate";
  const check = checkFeed(res.text, (item) => calendarDoc(item, chamber) !== null);
  ctx.log.notes.push(...feedNotes(type, check, `${chamberName} calendars`));
  const from = eventsFrom(ctx, p);
  const calendars = parseCalendarFeed(res.text, chamber).filter((day) => day.date >= from);
  if (calendars.length === 0 && !check.nothingPosted) {
    ctx.log.notes.push(`Texas Legislature Online: no ${chamberName} floor calendars are posted for ${p.name} yet (from ${from}).`);
  }
  // A feed with items the parser could not read is not the whole list, so nothing is noted as no longer listed.
  await saveEvents(ctx, p, "Texas Legislature Online calendars", "tlo_calendar:", calendars.map((day) => forOfficial(floorDraft(day), p)), {
    from,
    complete: check.unrecognized.length === 0,
  });
}

// --- Committee meetings.

export type Meeting = {
  session: string;
  committeeCode: string;
  committee: string;
  date: string;
  /** "08:00", or null when the notice gives no clock time. */
  time: string | null;
  timeText: string;
  location: string | null;
  url: string;
  noticeId: string;
  cancelled: boolean;
};

/** One meeting in a TLO meetings feed ("Public Health - 3/27/2023", "Time: 8:00 AM, Location: E2.036"), or null. */
export function meetingOf(item: RssItem): Meeting | null {
  const link = item.link?.match(/\/tlodocs\/(\d{2}[R\d])\/schedules\/html\/(C\d{3})(\d{4})(\d{2})(\d{2})(\d{5})\.htm$/i);
  const titled = item.title.match(/^(.*?)\s+-\s+(\d{1,2}\/\d{1,2}\/\d{4})$/);
  if (!link || !titled) return null;
  const date = `${link[3]}-${link[4]}-${link[5]}`;
  if (slashDate(titled[2]) !== date) return null;
  const timeText = item.description.match(/Time:\s*(.*?)(?:,\s*Location:|$)/i)?.[1]?.trim() ?? "";
  const location = item.description.match(/Location:\s*(.*)$/i)?.[1]?.trim() || null;
  return {
    session: link[1].toUpperCase(),
    committeeCode: link[2].toUpperCase(),
    committee: titled[1].trim(),
    date,
    time: clockTime(timeText),
    timeText,
    location,
    url: item.link!,
    noticeId: `${link[2]}${link[3]}${link[4]}${link[5]}${link[6]}`.toUpperCase(),
    cancelled: /cancel/i.test(`${item.title} ${item.description}`),
  };
}

/** Upcoming meetings from a TLO meetings feed. "No committee meetings scheduled." is none. */
export function parseMeetingFeed(xml: string): Meeting[] {
  return rssItems(xml).flatMap((item) => meetingOf(item) ?? []);
}

export function meetingDraft(m: Meeting, chamberName: string): EventDraft {
  const exact = m.time !== null && /^\d{1,2}:\d{2}\s*[AP]\.?M\.?$/i.test(m.timeText);
  return {
    kind: "committee_hearing",
    title: `${chamberName} Committee on ${m.committee}`,
    starts_on: m.date,
    starts_at: m.time ? zonedTime(m.date, m.time, "America/Chicago") : null,
    location: m.location,
    body: `${chamberName} Committee on ${m.committee}`,
    details: exact || !m.timeText ? "The meeting notice lists the bills and matters to be heard." : `Time as posted: ${m.timeText}. The meeting notice lists the bills and matters to be heard.`,
    status: m.cancelled ? "cancelled" : "scheduled",
    source_name: "Texas Legislature Online: committee meeting notice",
    source_url: m.url,
    event_key: `tlo_hearing:${m.session}:${m.committeeCode}:${m.date}:${m.noticeId.slice(-5)}`,
  };
}

/** Committee codes and names from a TLO member page ("MembershipCmte.aspx?LegSess=89R&CmteCode=C030"). */
export function memberCommittees(html: string) {
  const seen = new Map<string, { session: string; code: string; name: string }>();
  for (const m of html.matchAll(/MembershipCmte\.aspx\?LegSess=(\d{2}[R\d])&(?:amp;)?CmteCode=(C\d{3})"[^>]*>([^<]+)<\/a>/gi)) {
    const key = `${m[1]}:${m[2]}`;
    if (!seen.has(key)) seen.set(key, { session: m[1].toUpperCase(), code: m[2].toUpperCase(), name: decodeEntities(m[3]).trim() });
  }
  return [...seen.values()];
}

/** Sync source: hearings of the representative's own committees. */
export async function texasHearings(ctx: Ctx, p: Politician) {
  // The legislature the official sits in from their term start (the 90th for a term starting in 2027).
  const at = p.term_start && new Date(`${p.term_start}T12:00:00Z`) > ctx.now ? new Date(`${p.term_start}T12:00:00Z`) : ctx.now;
  const legislature = texasLegislature(at);
  const { data, error } = await ctx.db
    .from("tx_legislative_service")
    .select("tlo_member_code")
    .eq("politician_id", p.id)
    .eq("chamber", "house")
    .eq("legislature", legislature)
    .maybeSingle();
  if (error) throw new Error(`tx_legislative_service: ${error.message}`);
  const code = (data as { tlo_member_code: string | null } | null)?.tlo_member_code;
  if (!code) {
    ctx.log.notes.push(
      `Committee hearings: no TLO member code is stored for ${p.name} in the ${ordinal(legislature)} Legislature (tx_legislative_service.tlo_member_code), so committee membership cannot be read from Texas Legislature Online yet. Add it once capitol.texas.gov lists the member.`,
    );
    return;
  }
  const memberUrl = `https://capitol.texas.gov/Members/MemberInfo.aspx?Leg=${legislature}&Chamber=H&Code=${code}`;
  const page = await ctx.http.text(memberUrl, 30_000);
  const committees = page.ok ? memberCommittees(page.text) : [];
  if (committees.length === 0) {
    ctx.log.notes.push(`Committee hearings: Texas Legislature Online lists no committee assignments for ${p.name} in the ${ordinal(legislature)} Legislature yet (${memberUrl}).`);
    return;
  }
  const { error: memberError } = await ctx.db.from("tx_committee_memberships").upsert(
    committees.map((c) => ({ politician_id: p.id, body: "tx_house", session: c.session, committee_code: c.code, committee_name: c.name, source_url: memberUrl, checked_at: ctx.now.toISOString() })),
    { onConflict: "politician_id,body,session,committee_code" },
  );
  if (memberError) throw new Error(`tx_committee_memberships: ${memberError.message}`);
  const codes = new Set(committees.map((c) => c.code));
  const from = eventsFrom(ctx, p);
  const rows = [];
  let complete = true;
  for (const type of ["upcomingmeetingshouse", "upcomingmeetingsjoint"] as const) {
    const res = await ctx.http.text(`${TLO_RSS}${type}`, 30_000);
    if (!res.ok) throw new Error(`${res.status} from capitol.texas.gov RSS ${type}`);
    const check = checkFeed(res.text, (item) => meetingOf(item) !== null);
    ctx.log.notes.push(...feedNotes(type, check, `${type.endsWith("joint") ? "joint" : "House"} committee meetings`));
    if (check.unrecognized.length > 0) complete = false;
    for (const m of parseMeetingFeed(res.text)) {
      // Same legislature (committees carry over into its called sessions) and one of the member's committees.
      if (m.date < from || !codes.has(m.committeeCode) || !m.session.startsWith(String(legislature))) continue;
      rows.push(forOfficial(meetingDraft(m, type.endsWith("joint") ? "Joint" : "House"), p));
    }
  }
  await saveEvents(ctx, p, "Texas Legislature Online committee meetings", "tlo_hearing:", rows, { from, complete });
}
