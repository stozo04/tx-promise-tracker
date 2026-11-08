/** One site-wide sync per day. Anyone can ask for one, but only once every 24 hours. */
export const SYNC_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function cooldownRemaining(lastSyncedAt: string | null, now: number) {
  if (!lastSyncedAt) return 0;
  const last = Date.parse(lastSyncedAt);
  if (Number.isNaN(last)) return 0;
  return Math.max(0, last + SYNC_COOLDOWN_MS - now);
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
    errors: number;
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
  ingestRuns: { source_type: string; started_at: string; finished_at: string | null; counts: Record<string, unknown>; errors: unknown[] }[];
};

function asNumber(value: unknown) {
  return typeof value === "number" ? value : null;
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
          errors: Array.isArray(run.errors) ? run.errors.length : 0,
        }
      : null,
    officials,
  };
}
