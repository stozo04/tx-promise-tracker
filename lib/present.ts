import "server-only";

import type {
  Ledger,
  Politician,
  PromiseRow,
  SnapshotRow,
  SourceRow,
  StatusUpdateRow,
} from "@/lib/types";
import { normalizeUrl, storagePublicUrl } from "@/lib/urls";

export function presentPolitician(politician: Politician) {
  return { ...politician };
}

export function presentPromise(promise: PromiseRow, politician: Politician | undefined) {
  return {
    ...promise,
    politician_slug: politician?.slug ?? null,
    politician_name: politician?.name ?? null,
    office: politician?.office ?? null,
  };
}

export function presentSource(source: SourceRow, politician: Politician | undefined) {
  return {
    ...source,
    politician_slug: politician?.slug ?? null,
    politician_name: politician?.name ?? null,
  };
}

export function presentSnapshot(snapshot: SnapshotRow, supabaseUrl: string) {
  return {
    ...snapshot,
    screenshot_url: storagePublicUrl(supabaseUrl, snapshot.screenshot_storage_path),
    html_url: storagePublicUrl(supabaseUrl, snapshot.html_storage_path),
  };
}

export function presentStatusUpdate(update: StatusUpdateRow) {
  return { ...update };
}

export function snapshotsForPromise(ledger: Ledger, promise: PromiseRow) {
  const urls = new Set<string>([normalizeUrl(promise.source_url)]);
  const source = promise.source_id
    ? ledger.sources.find((row) => row.id === promise.source_id)
    : undefined;
  if (source) urls.add(normalizeUrl(source.url));
  return ledger.snapshots.filter((snapshot) => urls.has(normalizeUrl(snapshot.url)));
}

export function politicianMap(ledger: Ledger) {
  return new Map(ledger.politicians.map((politician) => [politician.id, politician]));
}
