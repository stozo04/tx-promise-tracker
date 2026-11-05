import { formatTimestamp } from "@/lib/format";
import type { ArchiveCard, Ledger, SnapshotRow } from "@/lib/types";
import { normalizeUrl, storagePublicUrl } from "@/lib/urls";

export function promiseCountForUrl(ledger: Ledger, url: string) {
  const key = normalizeUrl(url);
  return ledger.promises.filter((promise) => normalizeUrl(promise.source_url) === key).length;
}

export function toArchiveCard(ledger: Ledger, snapshot: SnapshotRow): ArchiveCard | null {
  const screenshotUrl = storagePublicUrl(ledger.supabaseUrl, snapshot.screenshot_storage_path);
  if (!screenshotUrl) return null;
  const politician = ledger.politicians.find((person) => person.id === snapshot.politician_id);
  return {
    id: snapshot.id,
    title: snapshot.title || "Archived page",
    politicianName: politician?.name ?? "Unknown",
    politicianSlug: politician?.slug ?? "",
    pageUrl: snapshot.url,
    waybackUrl: snapshot.wayback_url,
    screenshotUrl,
    htmlUrl: storagePublicUrl(ledger.supabaseUrl, snapshot.html_storage_path),
    capturedLabel: formatTimestamp(snapshot.captured_at) ?? snapshot.captured_at,
    promiseCount: promiseCountForUrl(ledger, snapshot.url),
    captureMethod: snapshot.capture_method,
  };
}

export function screenshotCards(ledger: Ledger) {
  return ledger.snapshots
    .map((snapshot) => toArchiveCard(ledger, snapshot))
    .filter((card): card is ArchiveCard => card !== null);
}

export function htmlOnlySnapshots(ledger: Ledger) {
  return ledger.snapshots.filter((snapshot) => !snapshot.screenshot_storage_path && snapshot.html_storage_path);
}
