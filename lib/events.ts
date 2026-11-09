/**
 * The Events calendar's shared logic: labels, grouping one event's rows across officials, Central
 * time, and the sources each kind of event comes from (named when nothing is loaded yet).
 * Sync fills tx_upcoming_events; see SYNC.md, "Events".
 */
import type { EventKind, UpcomingEventRow } from "@/lib/types";

export const EVENT_TIME_ZONE = "America/Chicago";

export const KIND_LABELS: Record<EventKind, string> = {
  session_day: "Session",
  floor_vote: "Floor vote",
  committee_hearing: "Hearing",
  deadline: "Deadline",
  appearance: "Appearance",
};

export function kindLabel(kind: string) {
  return KIND_LABELS[kind as EventKind] ?? "Event";
}

/** Where each kind of event comes from, by office. Used for "Not loaded yet" and the page footer. */
export const EVENT_SOURCES: { kind: EventKind; offices: string[]; source: string }[] = [
  { kind: "session_day", offices: ["tx_house", "tx_lt_governor"], source: "the convening and 140th days from Tex. Gov't Code §301.001 and Tex. Const. art. 3" },
  { kind: "session_day", offices: ["us_senate"], source: "the U.S. Senate floor schedule and tentative schedule on senate.gov" },
  { kind: "floor_vote", offices: ["tx_house", "tx_lt_governor"], source: "Texas Legislature Online House and Senate calendars" },
  { kind: "committee_hearing", offices: ["tx_house"], source: "Texas Legislature Online committee meeting notices" },
  { kind: "committee_hearing", offices: ["us_senate"], source: "senate.gov committee hearing schedules" },
  { kind: "deadline", offices: ["tx_house", "tx_lt_governor", "governor", "us_senate"], source: "dates the Texas Constitution, the Government Code and the U.S. Constitution set" },
  { kind: "appearance", offices: ["tx_house", "tx_lt_governor", "governor", "us_senate"], source: "each campaign's own events page" },
];

/** The sources behind the calendar, by short name, for the one-line footer. */
export const EVENT_SOURCE_NAMES = ["Texas Legislature Online", "senate.gov", "the Texas Constitution and statutes", "campaign events pages"];

/** "Texas Legislature Online committee meeting notices, senate.gov ..." for the kinds and offices shown. */
export function sourcesFor(offices: string[], kind: string = "all") {
  return [...new Set(EVENT_SOURCES.filter((s) => (kind === "all" || s.kind === kind) && s.offices.some((o) => offices.includes(o))).map((s) => s.source))];
}

/** One event as the calendar shows it: its rows for every official it concerns. */
export type CalendarEvent = {
  /** The id of the first row; /events/[id] shows every official's row of the event. */
  id: string;
  key: string;
  kind: EventKind;
  title: string;
  date: string;
  endDate: string | null;
  startsAt: string | null;
  location: string | null;
  body: string | null;
  status: UpcomingEventRow["status"];
  isCampaign: boolean;
  /** A date the law sets (it covers the whole day unless a time is given). */
  legal: boolean;
  politicianIds: string[];
};

/** Group rows of the same event (same event_key) into one calendar entry. */
export function groupEvents(rows: UpcomingEventRow[]): CalendarEvent[] {
  const byKey = new Map<string, CalendarEvent>();
  for (const row of rows) {
    if (!row.starts_on) continue;
    const key = row.event_key ?? row.external_id;
    const found = byKey.get(key);
    if (found) {
      if (!found.politicianIds.includes(row.politician_id)) found.politicianIds.push(row.politician_id);
      continue;
    }
    byKey.set(key, {
      id: row.id,
      key,
      kind: row.kind,
      title: row.title,
      date: row.starts_on,
      endDate: row.ends_on,
      startsAt: row.starts_at,
      location: row.location,
      body: row.body,
      status: row.status,
      isCampaign: row.is_campaign,
      legal: Boolean(row.legal_basis),
      politicianIds: [row.politician_id],
    });
  }
  return [...byKey.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.startsAt ?? "").localeCompare(b.startsAt ?? "") || a.title.localeCompare(b.title),
  );
}

/** The days an event covers, for a multi-day period ("State work period"). Capped at 62 days. */
export function eventDays(event: Pick<CalendarEvent, "date" | "endDate">) {
  const days = [event.date];
  if (!event.endDate || event.endDate <= event.date) return days;
  const at = new Date(`${event.date}T00:00:00Z`);
  while (days.length < 62) {
    at.setUTCDate(at.getUTCDate() + 1);
    const day = at.toISOString().slice(0, 10);
    if (day > event.endDate) break;
    days.push(day);
  }
  return days;
}

/** "2:30 p.m." in Central time. */
export function centralTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: EVENT_TIME_ZONE, hour: "numeric", minute: "2-digit" })
    .format(new Date(iso))
    .replace(/\s?AM$/, " a.m.")
    .replace(/\s?PM$/, " p.m.");
}

/** What the calendar says for an event's time: the time, "All day", or "Time not given". */
export function timeLabel(event: Pick<CalendarEvent, "startsAt" | "kind" | "endDate" | "date" | "legal">) {
  if (event.startsAt) return centralTime(event.startsAt);
  // A date the law sets, a deadline, or a multi-day period is a whole day by its nature; anything else just has no time posted.
  if (event.legal || event.kind === "deadline" || (event.endDate && event.endDate > event.date)) return "All day";
  return "Time not given";
}

/** Today in Central time, "2026-11-09". */
export function centralToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "Tuesday, January 12, 2027" for an ISO date. */
export function longDay(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "January 2027" for "2027-01". */
export function monthTitle(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1 + by, 1));
  return at.toISOString().slice(0, 7);
}

/** The 6-week grid (Sunday first) that shows a month: 35 or 42 ISO dates. */
export function monthGrid(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - first.getUTCDay());
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Math.ceil((first.getUTCDay() + lastDay) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => {
    const at = new Date(start);
    at.setUTCDate(start.getUTCDate() + i);
    return at.toISOString().slice(0, 10);
  });
}

/** Official order and color, from the ledger's politician order. Tokens only. */
export const OFFICIAL_COLORS = ["bg-bluebonnet", "bg-pear", "bg-cactus", "bg-clay"] as const;
