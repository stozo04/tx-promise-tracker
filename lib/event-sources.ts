/**
 * Which source fills which events, and the Congress.gov links for bills a hearing names. No imports,
 * so the Sync tests (Deno) load this file as they load lib/sync.ts.
 */

/**
 * Where each kind of event comes from, by office. `prefixes` are the event_key prefixes the source's
 * Sync module writes (supabase/functions/tx_sync/events_*.ts), so a source counts as loaded only when
 * one of its own events is.
 */
export const EVENT_SOURCES: { kind: string; offices: string[]; prefixes: string[]; source: string }[] = [
  { kind: "session_day", offices: ["tx_house", "tx_lt_governor"], prefixes: ["law:"], source: "the convening and 140th days from Tex. Gov't Code §301.001 and Tex. Const. art. 3" },
  { kind: "session_day", offices: ["us_senate"], prefixes: ["senate_floor:", "senate_schedule:"], source: "the U.S. Senate floor schedule and tentative schedule on senate.gov" },
  { kind: "floor_vote", offices: ["tx_house", "tx_lt_governor"], prefixes: ["tlo_calendar:"], source: "Texas Legislature Online House and Senate calendars" },
  { kind: "committee_hearing", offices: ["tx_house"], prefixes: ["tlo_hearing:"], source: "Texas Legislature Online committee meeting notices" },
  { kind: "committee_hearing", offices: ["us_senate"], prefixes: ["senate_hearing:"], source: "senate.gov committee hearing schedules" },
  { kind: "deadline", offices: ["tx_house", "tx_lt_governor", "governor", "us_senate"], prefixes: ["law:"], source: "dates the Texas Constitution, the Government Code and the U.S. Constitution set" },
  { kind: "appearance", offices: ["tx_house", "tx_lt_governor", "governor", "us_senate"], prefixes: ["campaign:"], source: "each campaign's own events page" },
];

function sourcesShown(offices: string[], kind: string) {
  return EVENT_SOURCES.filter((s) => (kind === "all" || s.kind === kind) && s.offices.some((o) => offices.includes(o)));
}

/** "Texas Legislature Online committee meeting notices, senate.gov ..." for the kinds and offices shown. */
export function sourcesFor(offices: string[], kind = "all") {
  return [...new Set(sourcesShown(offices, kind).map((s) => s.source))];
}

/**
 * The sources shown that have none of their own events among `events` (already narrowed to the
 * official and kind shown). A source is loaded only by an event of its kind whose event_key it wrote,
 * so Texas session days never make the Senate floor schedule look loaded.
 */
export function unloadedSources(offices: string[], kind: string, events: { kind: string; key: string }[]) {
  const loaded = (s: (typeof EVENT_SOURCES)[number]) =>
    events.some((e) => e.kind === s.kind && s.prefixes.some((prefix) => e.key.startsWith(prefix)));
  return [...new Set(sourcesShown(offices, kind).filter((s) => !loaded(s)).map((s) => s.source))];
}

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 121st. */
export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** The Congress in session on a date. A Congress starts on January 3 of an odd year (the 119th in 2025). */
export function congressOn(date: string) {
  const year = Number(date.slice(0, 4)) - (date.slice(5) < "01-03" ? 1 : 0);
  return Math.floor((year - 1789) / 2) + 1;
}

const BILL_PATHS: Record<string, string> = {
  S: "senate-bill",
  HR: "house-bill",
  SJRES: "senate-joint-resolution",
  HJRES: "house-joint-resolution",
  SRES: "senate-resolution",
  HRES: "house-resolution",
  SCONRES: "senate-concurrent-resolution",
  HCONRES: "house-concurrent-resolution",
};

/** The Congress.gov page of a bill a Senate hearing names ("SJRES 12" on 2027-03-02). Null if the type is unknown. */
export function congressBillUrl(bill: string, date: string) {
  const match = bill.trim().match(/^(H\.R\.|[A-Z]+)\s*(\d+)$/i);
  const path = match ? BILL_PATHS[match[1].toUpperCase().replace("H.R.", "HR")] : undefined;
  if (!match || !path) return null;
  return `https://www.congress.gov/bill/${ordinal(congressOn(date))}-congress/${path}/${match[2]}`;
}
