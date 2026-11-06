import "server-only";

import { createClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";

import { getSupabaseEnv } from "@/lib/env";
import type {
  IngestRun,
  Ledger,
  Politician,
  PromiseRow,
  SnapshotRow,
  SourceRow,
  StatusUpdateRow,
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

const POLITICIAN_ORDER = ["james-talarico", "gina-hinojosa"];

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

  const [politicians, promises, sources, snapshots, statusUpdates, ingestRuns] =
    await Promise.all([
      fetchTable(db, "politicians"),
      fetchTable(db, "promises"),
      fetchTable(db, "sources"),
      fetchTable(db, "snapshots"),
      fetchTable(db, "status_updates"),
      fetchTable(db, "ingest_runs"),
    ]);

  if (politicians.length === 0 || promises.length === 0) {
    throw new Error(
      "The ledger came back empty. This site will not invent promises to fill the page.",
    );
  }

  const ledger: Ledger = {
    fetchedAt: new Date().toISOString(),
    supabaseUrl: url,
    politicians: politicians as Politician[],
    promises: promises as PromiseRow[],
    sources: sources as SourceRow[],
    snapshots: snapshots as SnapshotRow[],
    statusUpdates: statusUpdates as StatusUpdateRow[],
    ingestRuns: ingestRuns as IngestRun[],
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
