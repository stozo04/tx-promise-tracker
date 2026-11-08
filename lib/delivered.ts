import { hostname } from "@/lib/format";
import { officeTermYears } from "@/lib/offices";
import type { Ledger, Politician, PromiseRow, StatusUpdateRow } from "@/lib/types";

/**
 * How one piece of evidence relates to the promise it is filed under.
 * It is derived from the status that the evidence moved the promise to,
 * so a single promise can collect evidence that points both ways over time.
 */
export type Direction = "match" | "against" | "partly" | "neutral";

/** Statuses that come from public evidence. A move back to "pending" or "unverified" is not an action. */
const ACTION_STATUSES = new Set(["in_progress", "kept", "partial", "broken", "superseded"]);

export function directionFor(status: string): Direction {
  if (status === "kept" || status === "in_progress") return "match";
  if (status === "broken") return "against";
  if (status === "partial") return "partly";
  return "neutral";
}

export function directionLabel(direction: Direction) {
  if (direction === "match") return "Matches their word";
  if (direction === "against") return "Goes against it";
  if (direction === "partly") return "Partly matches";
  return "Replaced by a newer promise";
}

export type DeliveredAction = {
  id: string;
  promiseId: string;
  status: string;
  direction: Direction;
  note: string | null;
  evidenceUrl: string | null;
  evidenceHost: string | null;
  decidedAt: string;
  year: string;
};

export type DeliveredPromise = {
  id: string;
  summary: string;
  quote: string;
  topic: string | null;
  type: string;
  dateSaid: string | null;
  sourceUrl: string;
  sourceHost: string;
  archiveUrl: string | null;
  actions: DeliveredAction[];
};

function toAction(update: StatusUpdateRow): DeliveredAction {
  return {
    id: update.id,
    promiseId: update.promise_id,
    status: update.status,
    direction: directionFor(update.status),
    note: update.evidence_note,
    evidenceUrl: update.evidence_url,
    evidenceHost: update.evidence_url ? hostname(update.evidence_url) : null,
    decidedAt: update.decided_at,
    year: update.decided_at.slice(0, 4),
  };
}

function toDelivered(promise: PromiseRow, updates: StatusUpdateRow[]): DeliveredPromise {
  return {
    id: promise.id,
    summary: promise.summary_text,
    quote: promise.verbatim_quote,
    topic: promise.topic,
    type: promise.promise_type,
    dateSaid: promise.date_said,
    sourceUrl: promise.source_url,
    sourceHost: hostname(promise.source_url),
    archiveUrl: promise.archive_url,
    actions: updates
      .filter((update) => update.promise_id === promise.id && ACTION_STATUSES.has(update.status))
      .map(toAction),
  };
}

/** Every promise for one politician, each with the evidence filed against it, oldest evidence first. */
export function deliveredFor(ledger: Ledger, politician: Politician): DeliveredPromise[] {
  return ledger.promises
    .filter((promise) => promise.politician_id === politician.id)
    .map((promise) => toDelivered(promise, ledger.statusUpdates));
}

export type DeliveredSummary = {
  pledges: number;
  platform: number;
  match: number;
  against: number;
  partly: number;
  quietPledges: number;
};

export function summarize(rows: DeliveredPromise[]): DeliveredSummary {
  const summary: DeliveredSummary = {
    pledges: 0,
    platform: 0,
    match: 0,
    against: 0,
    partly: 0,
    quietPledges: 0,
  };
  for (const row of rows) {
    if (row.type === "explicit_pledge") {
      summary.pledges += 1;
      if (row.actions.length === 0) summary.quietPledges += 1;
    } else {
      summary.platform += 1;
    }
    for (const action of row.actions) {
      if (action.direction === "match") summary.match += 1;
      else if (action.direction === "against") summary.against += 1;
      else if (action.direction === "partly") summary.partly += 1;
    }
  }
  return summary;
}

/** Calendar years a term covers, from the year it starts to the year it ends. */
export function termYears(politician: Politician) {
  if (!politician.term_start) return [];
  const start = Number(politician.term_start.slice(0, 4));
  const length = officeTermYears(politician.office);
  return Array.from({ length }, (_, index) => String(start + index));
}

export function termEndYear(politician: Politician) {
  const years = termYears(politician);
  return years.length ? Number(years[years.length - 1]) + 1 : null;
}
