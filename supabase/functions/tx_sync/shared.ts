// Shared pieces for every Sync source: the run log, HTTP helpers, dates, and the database handle.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// The client is created with db.schema "tx_tracker".
// deno-lint-ignore no-explicit-any
export type Db = SupabaseClient<any, "public", "tx_tracker", any, any>;

export type Log = {
  counts: Record<string, unknown>;
  errors: { source: string; message: string }[];
  notes: string[];
};

export const UA = "PromiseVsDelivered/1.0 (+https://github.com/stozo04/tx-promise-tracker)";

/** How every source reaches the network. Tests pass a fake one. */
export type Http = {
  json: (url: string) => Promise<unknown>;
  text: (url: string, timeoutMs?: number) => Promise<{ status: number; ok: boolean; text: string }>;
};

export const http: Http = {
  async json(url) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`${res.status} from ${new URL(url).hostname}${new URL(url).pathname}`);
    return res.json();
  },
  async text(url, timeoutMs = 20_000) {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xml;q=0.9,*/*;q=0.8" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    return { status: res.status, ok: res.ok, text: res.ok ? await res.text() : "" };
  },
};

export type Politician = {
  id: string;
  name: string;
  slug: string;
  office: string;
  election_date: string | null;
  term_start: string | null;
  fec_candidate_id: string | null;
  bioguide_id: string | null;
  lis_member_id: string | null;
  tec_filer_id: string | null;
  campaign_events_url: string | null;
};

/** Everything a source needs for one run. */
export type Ctx = {
  db: Db;
  http: Http;
  log: Log;
  dataGovKey: string;
  now: Date;
  /** When this run's ingest_runs row started (ISO). Pages checked before it are due again. */
  runStartedAt: string;
  /** Sources stop starting new requests after this time (ms since epoch), so the run ends in time. */
  deadline: number;
};

/** Add one stage's log to the run's log. Counts add up, nested counts (topic_matches) merge. */
export function mergeLog(into: Log, from: Log) {
  const merge = (a: Record<string, unknown>, b: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(b)) {
      if (typeof value === "number") a[key] = ((a[key] as number | undefined) ?? 0) + value;
      else if (value && typeof value === "object") merge((a[key] ??= {}) as Record<string, unknown>, value as Record<string, unknown>);
    }
  };
  merge(into.counts, from.counts);
  into.errors.push(...from.errors);
  into.notes.push(...from.notes.filter((note) => !into.notes.includes(note)));
}

export function bump(log: Log, key: string, by = 1) {
  log.counts[key] = ((log.counts[key] as number | undefined) ?? 0) + by;
}

export function message(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** "2027-01-12" for a moment, in Central time (where the Texas Legislature and the site's day live). */
export function centralDate(at: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** "03/20/2025" to "2025-03-20". Null when it is not a date. */
export function usDate(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}` : null;
}

/** The Texas Legislature that sits in a given year: the 89th in 2025-2026, the 90th in 2027-2028. */
export function texasLegislature(at: Date) {
  return 89 + Math.floor((Number(centralDate(at).slice(0, 4)) - 2025) / 2);
}

export async function upsert(db: Db, table: string, rows: Record<string, unknown>[], conflict: string, insertOnly = false) {
  if (rows.length === 0) return 0;
  const { error } = await db.from(table).upsert(rows, { onConflict: conflict, ignoreDuplicates: insertOnly });
  if (error) throw new Error(`${table}: ${error.message}`);
  return rows.length;
}

/** external_ids already stored, so a source only fetches what is new. */
export async function knownIds(db: Db, ids: string[]) {
  const seen = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("tx_record_actions").select("external_id").in("external_id", ids.slice(i, i + 200));
    if (error) throw new Error(`tx_record_actions: ${error.message}`);
    for (const row of (data ?? []) as { external_id: string }[]) seen.add(row.external_id);
  }
  return seen;
}

/**
 * Items a source has already read and that hold nothing new for an official (a journal day, a
 * Senate roll call they were not listed on). Kept in tx_checked_items so they are not read again.
 */
export async function checkedItems(db: Db, source: string) {
  const seen = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("tx_checked_items").select("item").eq("source", source).range(from, from + 999);
    if (error) throw new Error(`tx_checked_items: ${error.message}`);
    for (const row of (data ?? []) as { item: string }[]) seen.add(row.item);
    if ((data ?? []).length < 1000) return seen;
  }
}

export async function markChecked(db: Db, source: string, items: string[]) {
  if (items.length === 0) return;
  const { error } = await db
    .from("tx_checked_items")
    .upsert(items.map((item) => ({ source, item })), { onConflict: "source,item", ignoreDuplicates: true });
  if (error) throw new Error(`tx_checked_items: ${error.message}`);
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”",
  ldquo: "“", mdash: "—", ndash: "–", hellip: "…", eacute: "é", aacute: "á", iacute: "í", oacute: "ó",
  uacute: "ú", ntilde: "ñ", copy: "©",
};

export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[code.toLowerCase()] ?? all;
  });
}

/** The text of an HTML fragment on one line. */
export function cellText(html: string) {
  return decodeEntities(html.replace(/<br\b[^>]*>/gi, " ").replace(/<\/?(td|th|tr|p|div|li)\b[^>]*>/gi, " ").replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}
