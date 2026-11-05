export const STATUSES = [
  "pending",
  "in_progress",
  "kept",
  "partial",
  "broken",
  "superseded",
  "unverified",
] as const;

export const PROMISE_TYPES = ["explicit_pledge", "platform"] as const;

export type Status = (typeof STATUSES)[number];
export type PromiseType = (typeof PROMISE_TYPES)[number];

export type Politician = {
  id: string;
  name: string;
  slug: string;
  office: string;
  party: string | null;
  election_date: string | null;
  term_start: string | null;
  x_handle: string | null;
  x_user_id: string | null;
  youtube_url: string | null;
  campaign_site_url: string | null;
  official_site_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type PromiseRow = {
  id: string;
  politician_id: string;
  summary_text: string;
  topic: string | null;
  date_said: string | null;
  source_id: string | null;
  source_url: string;
  verbatim_quote: string;
  status: string;
  confidence: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  promise_type: string;
};

export type SourceRow = {
  id: string;
  politician_id: string;
  source_type: string;
  url: string;
  title: string | null;
  published_at: string | null;
  captured_at: string;
  raw_excerpt: string | null;
  checksum: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SnapshotRow = {
  id: string;
  politician_id: string;
  url: string;
  wayback_url: string | null;
  captured_at: string;
  html_storage_path: string | null;
  screenshot_storage_path: string | null;
  content_hash: string | null;
  capture_method: string | null;
  title: string | null;
  http_status: number | null;
  notes: string | null;
  created_at: string;
};

export type StatusUpdateRow = {
  id: string;
  promise_id: string;
  status: string;
  evidence_url: string | null;
  evidence_note: string | null;
  decided_at: string;
  decided_by: string;
  created_at: string;
};

export type IngestRun = {
  id: string;
  source_type: string;
  started_at: string;
  finished_at: string | null;
  counts: Record<string, unknown>;
  errors: unknown[];
  notes: string | null;
};

export type Ledger = {
  fetchedAt: string;
  supabaseUrl: string;
  politicians: Politician[];
  promises: PromiseRow[];
  sources: SourceRow[];
  snapshots: SnapshotRow[];
  statusUpdates: StatusUpdateRow[];
  ingestRuns: IngestRun[];
};

export type ArchiveCard = {
  id: string;
  title: string;
  politicianName: string;
  politicianSlug: string;
  pageUrl: string;
  waybackUrl: string | null;
  screenshotUrl: string;
  htmlUrl: string | null;
  capturedLabel: string;
  promiseCount: number;
  captureMethod: string | null;
};
