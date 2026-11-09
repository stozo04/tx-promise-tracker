// Texas Legislature Online events: the House and Senate floor calendars, and committee meetings of
// the committees an official sits on. Both come from TLO's own RSS feeds of upcoming items
// (capitol.texas.gov/MyTLO/RSS), which list every calendar and every posted meeting notice with a link
// to the document itself. Committee membership comes from the member's TLO page and is stored in
// tx_committee_memberships; a hearing is matched to an official only by committee code.
import { clockTime, type EventDraft, eventsFrom, forOfficial, saveEvents, slashDate, tag, zonedTime } from "./events.ts";
import { type Ctx, decodeEntities, ordinal, type Politician, texasLegislature } from "./shared.ts";

export const TLO_RSS = "https://capitol.texas.gov/MyTLO/RSS/RSS.aspx?Type=";

export type RssItem = { title: string; link: string | null; description: string };

export function rssItems(xml: string): RssItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => ({
    title: decodeEntities(tag(m[1], "title") ?? "").trim(),
    link: tag(m[1], "link"),
    description: decodeEntities(tag(m[1], "description") ?? "").trim(),
  }));
}

// --- Floor calendars.

export type FloorCalendar = { chamber: "H" | "S"; session: string; date: string; documents: { title: string; url: string }[] };

/** The documents that put bills before the full chamber; the others (amendment lists, referrals) are listed with them. */
const FLOOR_DOCS: Record<"H" | "S", RegExp> = {
  H: /^(Daily House Calendar|Supplemental House Calendar|Local, Consent, and Resolutions Calendar|Constitutional Amendments Calendar|Major State Calendar)/i,
  S: /^(Regular Order of Business|Notice of Intent|Intent Calendar|Local and Uncontested Calendar)/i,
};

/** Upcoming calendars from a TLO feed, one entry per chamber per day. "No calendars are available." is none. */
export function parseCalendarFeed(xml: string, chamber: "H" | "S"): FloorCalendar[] {
  const byDay = new Map<string, FloorCalendar>();
  for (const item of rssItems(xml)) {
    const match = item.link?.match(/\/tlodocs\/(\d{2}[R\d])\/calendars\/html\/([HS])[0-9A-Z](\d{4})(\d{2})(\d{2})\.htm$/i);
    const titled = item.title.match(/^(.*?)\s+-\s+(\d{1,2}\/\d{1,2}\/\d{4})$/);
    if (!match || !titled || match[2].toUpperCase() !== chamber) continue;
    const date = `${match[3]}-${match[4]}-${match[5]}`;
    if (slashDate(titled[2]) !== date) continue;
    const key = `${match[1]}:${date}`;
    const day = byDay.get(key) ?? { chamber, session: match[1].toUpperCase(), date, documents: [] };
    day.documents.push({ title: titled[1], url: item.link! });
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
  const from = eventsFrom(ctx, p);
  const calendars = parseCalendarFeed(res.text, chamber).filter((day) => day.date >= from);
  if (calendars.length === 0) {
    ctx.log.notes.push(`Texas Legislature Online: no ${chamber === "H" ? "House" : "Senate"} floor calendars are posted for ${p.name} yet (from ${from}).`);
  }
  await saveEvents(ctx, p, "Texas Legislature Online calendars", "tlo_calendar:", calendars.map((day) => forOfficial(floorDraft(day), p)), { from, complete: true });
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

/** Upcoming meetings from a TLO meetings feed ("Public Health - 3/27/2023", "Time: 8:00 AM, Location: E2.036"). */
export function parseMeetingFeed(xml: string): Meeting[] {
  const meetings: Meeting[] = [];
  for (const item of rssItems(xml)) {
    const link = item.link?.match(/\/tlodocs\/(\d{2}[R\d])\/schedules\/html\/(C\d{3})(\d{4})(\d{2})(\d{2})(\d{5})\.htm$/i);
    const titled = item.title.match(/^(.*?)\s+-\s+(\d{1,2}\/\d{1,2}\/\d{4})$/);
    if (!link || !titled) continue;
    const date = `${link[3]}-${link[4]}-${link[5]}`;
    if (slashDate(titled[2]) !== date) continue;
    const timeText = item.description.match(/Time:\s*(.*?)(?:,\s*Location:|$)/i)?.[1]?.trim() ?? "";
    const location = item.description.match(/Location:\s*(.*)$/i)?.[1]?.trim() || null;
    meetings.push({
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
    });
  }
  return meetings;
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
  for (const type of ["upcomingmeetingshouse", "upcomingmeetingsjoint"]) {
    const res = await ctx.http.text(`${TLO_RSS}${type}`, 30_000);
    if (!res.ok) throw new Error(`${res.status} from capitol.texas.gov RSS ${type}`);
    for (const m of parseMeetingFeed(res.text)) {
      // Same legislature (committees carry over into its called sessions) and one of the member's committees.
      if (m.date < from || !codes.has(m.committeeCode) || !m.session.startsWith(String(legislature))) continue;
      rows.push(forOfficial(meetingDraft(m, type.endsWith("joint") ? "Joint" : "House"), p));
    }
  }
  await saveEvents(ctx, p, "Texas Legislature Online committee meetings", "tlo_hearing:", rows, { from, complete: true });
}
