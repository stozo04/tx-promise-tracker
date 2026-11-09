// Shared pieces for the event sources (events_law.ts, events_texas.ts, events_senate.ts,
// events_campaign.ts): the row shape, Central-time conversion, and the refresh rule.
//
// Unlike votes, events are refreshed: schedules change, so a row is upserted on external_id and
// `updated_at` is set when its date, time, place, agenda or status changed. An event that is no
// longer listed by its source before its date is never deleted and is marked cancelled only when the
// source itself says so; otherwise the run notes it and the row is left as it is.
import { bump, centralDate, type Ctx, type Politician } from "./shared.ts";

export type EventKind = "session_day" | "floor_vote" | "committee_hearing" | "deadline" | "appearance";
export type EventStatus = "scheduled" | "changed" | "cancelled" | "held";

/** One official's row of one event. `event_key` is shared by every official's row of the same event. */
export type EventRow = {
  politician_id: string;
  kind: EventKind;
  title: string;
  starts_on: string;
  ends_on: string | null;
  starts_at: string | null;
  time_zone: string;
  location: string | null;
  details: string | null;
  body: string | null;
  legal_basis: string | null;
  legal_url: string | null;
  computed_from: string | null;
  is_campaign: boolean;
  bills: string[];
  status: EventStatus;
  source_name: string;
  source_url: string;
  event_key: string;
  external_id: string;
};

/** Everything but the official, so one event can be written for several officials. */
export type EventDraft = Omit<EventRow, "politician_id" | "external_id" | "status" | "time_zone" | "legal_basis" | "legal_url" | "computed_from" | "is_campaign" | "bills" | "ends_on" | "starts_at" | "location" | "details" | "body"> &
  Partial<Pick<EventRow, "status" | "time_zone" | "legal_basis" | "legal_url" | "computed_from" | "is_campaign" | "bills" | "ends_on" | "starts_at" | "location" | "details" | "body">>;

export function forOfficial(draft: EventDraft, p: Pick<Politician, "id" | "slug">): EventRow {
  return {
    ends_on: null,
    starts_at: null,
    time_zone: "America/Chicago",
    location: null,
    details: null,
    body: null,
    legal_basis: null,
    legal_url: null,
    computed_from: null,
    is_campaign: false,
    bills: [],
    status: "scheduled",
    ...draft,
    politician_id: p.id,
    external_id: `${draft.event_key}:${p.slug}`,
  };
}

/** The UTC instant of a wall-clock time in a time zone ("2027-01-12", "12:00", "America/Chicago"). */
export function zonedTime(date: string, time: string, timeZone: string) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // The zone's offset at that moment, read back through Intl. Two passes settle the DST edges.
  const offset = (at: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
        .formatToParts(new Date(at))
        .map((part) => [part.type, part.value]),
    );
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute)) - at;
  };
  let at = guess - offset(guess);
  at = guess - offset(at);
  return new Date(at).toISOString();
}

/** "2:30 PM" or "10:00 a.m." to "14:30". Null when the text does not start with a clock time. */
export function clockTime(text: string) {
  const match = text.trim().match(/^(\d{1,2}):(\d{2})\s*([ap])\.?\s?m\.?/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toLowerCase() === "p") hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

/** Wall-clock time in Central time for an instant: "2:30 p.m." */
export function centralClock(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" })
    .format(new Date(iso))
    .replace(/\s?AM$/, " a.m.")
    .replace(/\s?PM$/, " p.m.");
}

/** "M/D/YYYY" to "YYYY-MM-DD". */
export function slashDate(text: string) {
  const match = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}` : null;
}

/** Add days to an ISO date. */
export function addDays(date: string, days: number) {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** The first day an official's events may fall on: the term start, or today if that is later. */
export function eventsFrom(ctx: Ctx, p: Pick<Politician, "term_start">) {
  const today = centralDate(ctx.now);
  return p.term_start && p.term_start > today ? p.term_start : today;
}

const COMPARED = ["kind", "title", "starts_on", "ends_on", "starts_at", "location", "details", "body", "bills", "status", "source_url"] as const;

/**
 * Write one source's events for one official, refreshing rows that changed.
 *
 * `prefix` is the external_id prefix this source owns ("tlo_hearing:"). When `complete` is true the
 * rows are everything the source lists from `from` on, so a stored future row it no longer lists is
 * noted (never deleted, never marked cancelled unless the source says so).
 */
export async function saveEvents(
  ctx: Ctx,
  p: Pick<Politician, "id" | "name">,
  label: string,
  prefix: string,
  rows: EventRow[],
  opts: { from: string; complete: boolean },
) {
  const { data, error } = await ctx.db
    .from("tx_upcoming_events")
    .select("external_id, kind, title, starts_on, ends_on, starts_at, location, details, body, bills, status, source_url")
    .eq("politician_id", p.id)
    .like("external_id", `${prefix}%`)
    .gte("starts_on", opts.from);
  if (error) throw new Error(`tx_upcoming_events: ${error.message}`);
  const stored = new Map(((data ?? []) as Record<string, unknown>[]).map((row) => [row.external_id as string, row]));
  const now = ctx.now.toISOString();
  const writes: Record<string, unknown>[] = [];
  let added = 0;
  let changed = 0;
  for (const row of rows) {
    const old = stored.get(row.external_id);
    if (!old) {
      writes.push(row);
      added++;
      continue;
    }
    const same = (key: (typeof COMPARED)[number]) => {
      const a = old[key];
      const b = row[key];
      if (key === "starts_at") return (a ? Date.parse(a as string) : null) === (b ? Date.parse(b as string) : null);
      return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    };
    // A row already marked changed stays changed while nothing else moves.
    const differs = COMPARED.filter((key) => key !== "status" && !same(key));
    const status = row.status === "cancelled" ? "cancelled" : differs.length > 0 ? "changed" : (old.status as EventStatus);
    if (differs.length === 0 && status === old.status) continue;
    writes.push({ ...row, status, updated_at: now });
    changed++;
  }
  if (writes.length > 0) {
    const { error: upsertError } = await ctx.db.from("tx_upcoming_events").upsert(writes, { onConflict: "external_id" });
    if (upsertError) throw new Error(`tx_upcoming_events: ${upsertError.message}`);
  }
  bump(ctx.log, "events_added", added);
  bump(ctx.log, "events_changed", changed);
  if (opts.complete) {
    const listed = new Set(rows.map((row) => row.external_id));
    const missing = [...stored.entries()].filter(([id, row]) => !listed.has(id) && row.status !== "cancelled");
    if (missing.length > 0) {
      ctx.log.notes.push(
        `${label}: ${missing.length} stored ${missing.length === 1 ? "event for" : "events for"} ${p.name} ${missing.length === 1 ? "is" : "are"} no longer listed (${missing
          .slice(0, 3)
          .map(([, row]) => `${row.title}, ${row.starts_on}`)
          .join("; ")}). Left as is: the source has not said ${missing.length === 1 ? "it was" : "they were"} cancelled.`,
      );
    }
  }
  return { added, changed };
}

/** Text of an RSS or XML element, entities decoded by the caller. */
export function tag(xml: string, name: string) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return match ? match[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim() : null;
}
