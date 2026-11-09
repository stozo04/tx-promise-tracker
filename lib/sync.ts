/**
 * One site-wide sync per calendar day in Central time. Anyone can start it; if nobody does, the
 * nightly job starts it at 11:30 pm CT. Must match tx_tracker.tx_claim_sync().
 */
export const SYNC_TIME_ZONE = "America/Chicago";

const DAY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: SYNC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** "2026-11-09", the Central-time calendar day of a moment. */
export function centralDay(ms: number) {
  const parts = Object.fromEntries(DAY_PARTS.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** The first moment of the next Central-time day after `ms` (handles the daylight-time switch). */
export function nextCentralMidnight(ms: number) {
  const day = centralDay(ms);
  // Midnight is 05:00 or 06:00 UTC; step forward from 04:00 UTC of the next date until the day changes.
  const [y, m, d] = day.split("-").map(Number);
  let probe = Date.UTC(y, m - 1, d + 1, 4, 0, 0);
  while (centralDay(probe) === day) probe += 60 * 60 * 1000;
  return probe;
}

/** How long until the next sync may start: zero when nobody has synced today (Central time). */
export function cooldownRemaining(lastSyncedAt: string | null, now: number) {
  if (!lastSyncedAt) return 0;
  const last = Date.parse(lastSyncedAt);
  if (Number.isNaN(last)) return 0;
  if (centralDay(last) !== centralDay(now)) return 0;
  return Math.max(0, nextCentralMidnight(now) - now);
}

/** "6h 12m", "45m", or "less than a minute". */
export function formatWait(ms: number) {
  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes <= 0) return "less than a minute";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** "3 hours ago", "12 minutes ago", "2 days ago". */
export function formatAgo(iso: string, now: number) {
  const diff = Math.max(0, now - Date.parse(iso));
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

export type SyncSummary = {
  lastRun: {
    startedAt: string;
    finishedAt: string | null;
    /** Null when the run predates the topic sweep. */
    pagesChecked: number | null;
    pagesChanged: number | null;
    billsChecked: number | null;
    /** "button" or "schedule". */
    triggeredBy: string | null;
    /** Each source that failed, with its message. */
    errors: { source: string; message: string }[];
    /** One line per skipped source, backlog, or source that is not automated yet. */
    notes: string[];
  } | null;
  officials: {
    slug: string;
    name: string;
    topics: { code: string; label: string; matched: number | null; awaiting: number }[];
  }[];
};

type SummaryInput = {
  politicians: { id: string; slug: string; name: string }[];
  topics: { code: string; label: string; active: boolean }[];
  topicFindings: { politician_id: string | null; topic: string; status: string }[];
  ingestRuns: {
    source_type: string;
    started_at: string;
    finished_at: string | null;
    counts: Record<string, unknown>;
    errors: unknown[];
    notes?: string | null;
    triggered_by?: string | null;
  }[];
};

function asNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

/** The run's errors as { source, message }, whatever shape they were saved in. */
export function runErrors(errors: unknown[]) {
  return (Array.isArray(errors) ? errors : []).map((row) => {
    const value = (row ?? {}) as { source?: unknown; message?: unknown };
    return {
      source: typeof value.source === "string" ? value.source : "unknown source",
      message: typeof value.message === "string" ? value.message : JSON.stringify(row),
    };
  });
}

/** The run's notes, one per line, without the placeholder the run starts with. */
export function runNotes(notes: string | null | undefined) {
  return (notes ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^Started by the (public Sync button|nightly schedule)$/.test(line));
}

/** The last Sync run, per official and per topic, plus findings still waiting for review. */
export function syncSummary(ledger: SummaryInput): SyncSummary {
  const run = ledger.ingestRuns
    .filter((row) => row.source_type === "tx_sync")
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  const counts = run?.counts ?? {};
  const pagesChecked = asNumber(counts.topic_pages_checked);
  const matches = (counts.topic_matches ?? {}) as Record<string, Record<string, number>>;
  const active = ledger.topics.filter((topic) => topic.active);
  const awaiting = (politicianId: string | null, code: string) =>
    ledger.topicFindings.filter((row) => row.politician_id === politicianId && row.topic === code && row.status === "new").length;

  const officials: SyncSummary["officials"] = ledger.politicians.map((politician) => ({
    slug: politician.slug,
    name: politician.name,
    topics: active.map((topic) => ({
      code: topic.code,
      label: topic.label,
      matched: pagesChecked === null ? null : (matches[politician.slug]?.[topic.code] ?? 0),
      awaiting: awaiting(politician.id, topic.code),
    })),
  }));
  officials.push({
    slug: "watched-bills",
    name: "Watched bills",
    topics: active.map((topic) => ({
      code: topic.code,
      label: topic.label,
      matched: pagesChecked === null ? null : (matches["watched-bills"]?.[topic.code] ?? 0),
      awaiting: awaiting(null, topic.code),
    })),
  });

  return {
    lastRun: run
      ? {
          startedAt: run.started_at,
          finishedAt: run.finished_at,
          pagesChecked,
          pagesChanged: asNumber(counts.topic_pages_changed),
          billsChecked: asNumber(counts.topic_bills_checked),
          triggeredBy: run.triggered_by ?? null,
          errors: runErrors(run.errors),
          notes: runNotes(run.notes),
        }
      : null,
    officials,
  };
}
