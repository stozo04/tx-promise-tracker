// U.S. Senate events from senate.gov: the next meeting on the floor schedule, the non-legislative
// periods on the Senate's tentative schedule, and committee hearings of the senator's own committees.
// Committee membership comes from senate.gov's member data (matched on bioguide ID) and is stored in
// tx_committee_memberships. Senate times are Eastern; they are converted to Central, and the time as
// the Senate states it is kept in the details.
import { centralClock, clockTime, type EventDraft, eventsFrom, forOfficial, saveEvents, tag, zonedTime } from "./events.ts";
import { cellText, centralDate, type Ctx, decodeEntities, type Politician } from "./shared.ts";

export const SENATE_FLOOR_SCHEDULE = "https://www.senate.gov/legislative/schedule/floor_schedule.htm";
export const SENATE_HEARINGS = "https://www.senate.gov/general/committee_schedules/hearings.xml";
export const SENATE_MEMBERS = "https://www.senate.gov/legislative/LIS_MEMBER/cvc_member_data.xml";
export const senateScheduleUrl = (year: number) => `https://www.senate.gov/legislative/${year}_schedule.xml`;

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

/** The next meeting on the floor schedule: "Monday, Nov 09, 2026" and "Convene at 3:00 p.m." */
export function parseFloorSchedule(html: string) {
  const article = html.match(/<article id="proceedings_schedule"[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  if (!article) return null;
  const heading = cellText(article.match(/<h3>([\s\S]*?)<\/h3>/i)?.[1] ?? "");
  const day = heading.match(/^[A-Za-z]+,\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s+(\d{4})$/);
  if (!day || !MONTHS[day[1].toLowerCase()]) return null;
  const text = cellText(article.match(/<span class="floor-schedule">([\s\S]*?)<\/span>/i)?.[1] ?? "");
  const time = text.match(/\bat\s+(\d{1,2}:\d{2}\s*[ap]\.m\.)/i)?.[1] ?? null;
  return { date: `${day[3]}-${MONTHS[day[1].toLowerCase()]}-${day[2].padStart(2, "0")}`, text, time: time ? clockTime(time) : null, timeText: time };
}

export function floorDraft(next: NonNullable<ReturnType<typeof parseFloorSchedule>>): EventDraft {
  const startsAt = next.time ? zonedTime(next.date, next.time, "America/New_York") : null;
  return {
    kind: "session_day",
    title: /pro forma/i.test(next.text) ? "U.S. Senate pro forma session" : "U.S. Senate convenes",
    starts_on: next.date,
    starts_at: startsAt,
    location: "U.S. Capitol, Washington, D.C.",
    body: "U.S. Senate",
    details: `The Senate floor schedule says: "${next.text}"${startsAt ? ` That is ${next.timeText} Eastern, ${centralClock(startsAt)} Central.` : ""}`,
    source_name: "U.S. Senate floor schedule",
    source_url: SENATE_FLOOR_SCHEDULE,
    event_key: `senate_floor:${next.date}`,
  };
}

/** Periods the tentative schedule says the Senate is not expected to be in session. */
export function parseTentativeSchedule(xml: string) {
  return [...xml.matchAll(/<date>([\s\S]*?)<\/date>/gi)]
    .map((m) => ({
      begin: tag(m[1], "beginDate") ?? "",
      end: tag(m[1], "endDate") ?? "",
      action: decodeEntities(tag(m[1], "action") ?? ""),
      note: decodeEntities(tag(m[1], "note") ?? ""),
    }))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.begin));
}

export function workPeriodDraft(period: ReturnType<typeof parseTentativeSchedule>[number], year: number): EventDraft {
  return {
    kind: "session_day",
    title: period.action ? `No Senate session expected: ${period.action.toLowerCase()}` : "No Senate session expected",
    starts_on: period.begin,
    ends_on: period.end && period.end !== period.begin ? period.end : null,
    body: "U.S. Senate",
    details: `The Senate's tentative ${year} schedule lists this as an expected non-legislative period.${period.note ? ` ${period.note}.` : ""} The schedule is tentative.`,
    source_name: `U.S. Senate tentative ${year} schedule`,
    source_url: `https://www.senate.gov/legislative/${year}_schedule.htm`,
    event_key: `senate_schedule:${period.begin}`,
  };
}

export type SenateHearing = {
  id: string;
  code: string;
  committee: string;
  type: string;
  date: string;
  time: string | null;
  timeText: string;
  room: string | null;
  matter: string;
  bills: string[];
};

/** Hearings in senate.gov's hearings.xml. The placeholder row ("No committee hearings scheduled") has no code. */
export function parseSenateHearings(xml: string): SenateHearing[] {
  const hearings: SenateHearing[] = [];
  for (const m of xml.matchAll(/<meeting>([\s\S]*?)<\/meeting>/gi)) {
    const code = tag(m[1], "cmte_code");
    const id = tag(m[1], "identifier");
    const date = tag(m[1], "date_iso_8601");
    if (!code || !id || !date) continue;
    const timeText = tag(m[1], "time") ?? "";
    const bills = [...m[1].matchAll(/<AssociatedDocument[^>]*document_num="(\d+)"[^>]*document_prefix="([A-Z.]+)"/gi)]
      .filter((d) => /^(S|HR|H\.R\.|SJRES|HJRES|SRES|HRES|SCONRES|HCONRES)$/i.test(d[2]))
      .map((d) => `${d[2].toUpperCase().replace("H.R.", "HR")} ${d[1]}`);
    hearings.push({
      id,
      code: code.toUpperCase(),
      committee: decodeEntities(tag(m[1], "committee") ?? ""),
      type: decodeEntities(tag(m[1], "type") ?? ""),
      date,
      time: clockTime(timeText),
      timeText,
      room: decodeEntities(tag(m[1], "room") ?? "") || null,
      matter: cellText(decodeEntities(tag(m[1], "matter") ?? "")),
      bills,
    });
  }
  return hearings;
}

export function hearingDraft(h: SenateHearing): EventDraft {
  const startsAt = h.time ? zonedTime(h.date, h.time, "America/New_York") : null;
  return {
    kind: "committee_hearing",
    title: `Senate Committee on ${h.committee}${h.type && !/^open hearing$/i.test(h.type) ? ` (${h.type})` : ""}`,
    starts_on: h.date,
    starts_at: startsAt,
    location: h.room ? `${h.room}, Washington, D.C.` : null,
    body: `Senate Committee on ${h.committee}`,
    details: `${h.matter}${startsAt ? ` Scheduled for ${h.timeText.replace(/^0/, "")} Eastern (${centralClock(startsAt)} Central).` : ""}`,
    bills: h.bills,
    status: /cancel|postpone/i.test(`${h.type} ${h.matter}`) ? "cancelled" : "scheduled",
    source_name: "U.S. Senate committee hearing schedule",
    source_url: SENATE_HEARINGS,
    event_key: `senate_hearing:${h.id}`,
  };
}

/** A senator's committees in senate.gov's member data, found by bioguide ID only. */
export function senatorCommittees(xml: string, bioguideId: string) {
  for (const m of xml.matchAll(/<senator\b[^>]*>([\s\S]*?)<\/senator>/gi)) {
    if (tag(m[1], "bioguideId") !== bioguideId) continue;
    return [...m[1].matchAll(/<committee code="([A-Z0-9]+)">([^<]*)<\/committee>/gi)].map((c) => ({ code: c[1].toUpperCase(), name: decodeEntities(c[2]).trim() }));
  }
  return null;
}

/** Sync source: the Senate floor schedule and tentative schedule, from the senator's term start on. */
export async function senateFloor(ctx: Ctx, p: Politician) {
  const from = eventsFrom(ctx, p);
  const rows = [];
  const floor = await ctx.http.text(SENATE_FLOOR_SCHEDULE, 30_000);
  if (!floor.ok) throw new Error(`${floor.status} from ${SENATE_FLOOR_SCHEDULE}`);
  const next = parseFloorSchedule(floor.text);
  if (!next) ctx.log.notes.push("U.S. Senate floor schedule: the next meeting could not be read from senate.gov.");
  else if (next.date >= from) rows.push(forOfficial(floorDraft(next), p));
  else ctx.log.notes.push(`U.S. Senate floor schedule: the next meeting (${next.date}) is before ${p.name}'s term starts (${p.term_start}); it is not shown.`);
  await saveEvents(ctx, p, "U.S. Senate floor schedule", "senate_floor:", rows, { from, complete: false });

  // The tentative schedule for the year events start in, and the next year once it is published.
  const periods = [];
  for (const year of [Number(from.slice(0, 4)), Number(from.slice(0, 4)) + 1]) {
    const res = await ctx.http.text(senateScheduleUrl(year), 30_000);
    const parsed = res.ok && res.text.includes("<schedule>") ? parseTentativeSchedule(res.text) : [];
    if (parsed.length === 0) {
      if (year === Number(from.slice(0, 4))) ctx.log.notes.push(`U.S. Senate tentative schedule: senate.gov has not published ${year}_schedule.xml yet.`);
      continue;
    }
    periods.push(...parsed.filter((d) => (d.end || d.begin) >= from).map((d) => forOfficial(workPeriodDraft(d, year), p)));
  }
  await saveEvents(ctx, p, "U.S. Senate tentative schedule", "senate_schedule:", periods, { from, complete: false });
}

/** Sync source: hearings of the senator's own committees. */
export async function senateHearings(ctx: Ctx, p: Politician) {
  if (!p.bioguide_id) {
    ctx.log.notes.push(`Senate committee hearings: no bioguide_id is stored for ${p.name}, so committee membership cannot be read from senate.gov yet. Add it from congress.gov after the swearing-in.`);
    return;
  }
  const members = await ctx.http.text(SENATE_MEMBERS, 30_000);
  if (!members.ok) throw new Error(`${members.status} from ${SENATE_MEMBERS}`);
  const committees = senatorCommittees(members.text, p.bioguide_id);
  if (!committees || committees.length === 0) {
    ctx.log.notes.push(`Senate committee hearings: senate.gov lists no committee assignments for ${p.name} (${p.bioguide_id}) yet.`);
    return;
  }
  const session = `${119 + Math.floor((Number(centralDate(ctx.now).slice(0, 4)) - 2025) / 2)}`;
  const { error } = await ctx.db.from("tx_committee_memberships").upsert(
    committees.map((c) => ({ politician_id: p.id, body: "us_senate", session, committee_code: c.code, committee_name: c.name, source_url: SENATE_MEMBERS, checked_at: ctx.now.toISOString() })),
    { onConflict: "politician_id,body,session,committee_code" },
  );
  if (error) throw new Error(`tx_committee_memberships: ${error.message}`);
  const codes = new Set(committees.map((c) => c.code));
  const res = await ctx.http.text(SENATE_HEARINGS, 30_000);
  if (!res.ok) throw new Error(`${res.status} from ${SENATE_HEARINGS}`);
  const from = eventsFrom(ctx, p);
  const rows = parseSenateHearings(res.text)
    .filter((h) => h.date >= from && codes.has(h.code))
    .map((h) => forOfficial(hearingDraft(h), p));
  await saveEvents(ctx, p, "U.S. Senate committee hearings", "senate_hearing:", rows, { from, complete: true });
}
