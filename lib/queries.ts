import "server-only";

import { createClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";

import { getSupabaseEnv } from "@/lib/env";
import { topicLabel } from "@/lib/format";
import type {
  ContributionRow,
  ContributionSummaryRow,
  IngestRun,
  Ledger,
  Politician,
  PromiseRow,
  RecordActionRow,
  SnapshotRow,
  SourceRow,
  StatusUpdateRow,
  TopicFindingRow,
  TopicRow,
  UpcomingEventRow,
  VoteTotalRow,
} from "@/lib/types";

type PageResult = {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
};

type LooseSchema = {
  from: (table: string) => {
    select: (columns: string) => {
      range: (from: number, to: number) => PromiseLike<PageResult>;
    };
  };
};

/** Header switch order: Senator, Governor, Lt. Governor, then House districts. */
const POLITICIAN_ORDER = ["james-talarico", "gina-hinojosa", "vikki-goodwin", "zach-herbert"];

async function fetchTable(db: LooseSchema, table: string) {
  const pageSize = 1000;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db.from(table).select("*").range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`Could not read tx_tracker.${table}: ${error.message}`);
    }
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

export async function loadLedger(): Promise<Ledger> {
  "use cache";
  cacheLife("minutes");
  cacheTag("ledger");

  const { url, key } = getSupabaseEnv();
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const db = (client as unknown as { schema: (name: string) => LooseSchema }).schema(
    "tx_tracker",
  );

  const [
    politicians,
    promises,
    sources,
    snapshots,
    statusUpdates,
    ingestRuns,
    recordActions,
    upcomingEvents,
    contributions,
    contributionSummaries,
    voteTotals,
    topics,
    topicFindings,
  ] = await Promise.all([
    fetchTable(db, "politicians"),
    fetchTable(db, "promises"),
    fetchTable(db, "sources"),
    fetchTable(db, "snapshots"),
    fetchTable(db, "status_updates"),
    fetchTable(db, "ingest_runs"),
    fetchTable(db, "tx_record_actions"),
    fetchTable(db, "tx_upcoming_events"),
    fetchTable(db, "tx_contributions"),
    fetchTable(db, "tx_contribution_summaries"),
    fetchTable(db, "tx_community_vote_totals"),
    fetchTable(db, "tx_topics"),
    fetchTable(db, "tx_topic_findings"),
  ]);

  const registry = Object.fromEntries((topics as TopicRow[]).map((topic) => [topic.code, topic.label]));

  if (politicians.length === 0 || promises.length === 0) {
    throw new Error(
      "The ledger came back empty. This site will not invent promises to fill the page.",
    );
  }

  const ledger: Ledger = {
    fetchedAt: new Date().toISOString(),
    supabaseUrl: url,
    politicians: politicians as Politician[],
    promises: (promises as Omit<PromiseRow, "topic_label">[]).map((promise) => ({
      ...promise,
      topic_label: topicLabel(promise.topic, registry),
    })),
    sources: sources as SourceRow[],
    snapshots: snapshots as SnapshotRow[],
    statusUpdates: statusUpdates as StatusUpdateRow[],
    ingestRuns: ingestRuns as IngestRun[],
    recordActions: (recordActions as RecordActionRow[]).sort((a, b) => b.acted_on.localeCompare(a.acted_on)),
    upcomingEvents: (upcomingEvents as UpcomingEventRow[]).sort((a, b) =>
      (a.starts_on ?? "9999").localeCompare(b.starts_on ?? "9999"),
    ),
    contributions: (contributions as ContributionRow[])
      .map((row) => ({ ...row, amount: Number(row.amount) }))
      .sort((a, b) => b.amount - a.amount),
    contributionSummaries: (contributionSummaries as ContributionSummaryRow[]).map((row) => ({
      ...row,
      receipts: row.receipts === null ? null : Number(row.receipts),
      individual_unitemized: row.individual_unitemized === null ? null : Number(row.individual_unitemized),
      individual_itemized: row.individual_itemized === null ? null : Number(row.individual_itemized),
      state_itemized_total: row.state_itemized_total === null ? null : Number(row.state_itemized_total),
      in_state_itemized: row.in_state_itemized === null ? null : Number(row.in_state_itemized),
    })),
    voteTotals: voteTotals as VoteTotalRow[],
    topics: (topics as TopicRow[]).sort((a, b) => a.label.localeCompare(b.label)),
    topicFindings: (topicFindings as TopicFindingRow[]).sort((a, b) => b.found_at.localeCompare(a.found_at)),
  };

  ledger.politicians.sort((a, b) => {
    const aIndex = POLITICIAN_ORDER.indexOf(a.slug);
    const bIndex = POLITICIAN_ORDER.indexOf(b.slug);
    const aRank = aIndex === -1 ? 99 : aIndex;
    const bRank = bIndex === -1 ? 99 : bIndex;
    return aRank - bRank || a.name.localeCompare(b.name);
  });

  ledger.promises.sort((a, b) => {
    const aDate = a.date_said ?? "";
    const bDate = b.date_said ?? "";
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    return b.created_at.localeCompare(a.created_at);
  });

  ledger.statusUpdates.sort((a, b) => a.decided_at.localeCompare(b.decided_at));
  ledger.snapshots.sort((a, b) => b.captured_at.localeCompare(a.captured_at));

  return JSON.parse(JSON.stringify(ledger)) as Ledger;
}

export function politicianBySlug(ledger: Ledger, slug: string) {
  return ledger.politicians.find((politician) => politician.slug === slug.toLowerCase());
}

/**
 * The newest ingest run, read fresh rather than from the ledger cache.
 * The sync cooldown depends on it, so it must not be minutes out of date.
 */
export async function latestIngestRun(): Promise<{ started_at: string; finished_at: string | null } | null> {
  const { url, key } = getSupabaseEnv();
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const db = (client as unknown as {
    schema: (name: string) => {
      from: (table: string) => {
        select: (columns: string) => {
          order: (column: string, options: { ascending: boolean }) => {
            limit: (count: number) => PromiseLike<{
              data: { started_at: string; finished_at: string | null }[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  }).schema("tx_tracker");
  const { data, error } = await db
    .from("ingest_runs")
    .select("started_at, finished_at")
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Could not read tx_tracker.ingest_runs: ${error.message}`);
  return data?.[0] ?? null;
}
