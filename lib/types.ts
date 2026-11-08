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
  /** Texas House district number, e.g. "112". Empty for statewide offices. */
  district?: string | null;
  party: string | null;
  election_date: string | null;
  term_start: string | null;
  x_handle: string | null;
  x_user_id: string | null;
  youtube_url: string | null;
  campaign_site_url: string | null;
  archive_url: string | null;
  official_site_url: string | null;
  portrait_url?: string | null;
  portrait_credit?: string | null;
  portrait_source_url?: string | null;
  /** Campaign pages outside the main sitemap (petition subdomains) that Sync reads for topics. */
  campaign_watch_urls?: string[];
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
  archive_url: string | null;
  verbatim_quote: string;
  status: string;
  confidence: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  promise_type: string;
  /** The topic's label, resolved on the server from the topic registry (tx_topics), with lib/format.ts as fallback. */
  topic_label: string;
};

export type SourceRow = {
  id: string;
  politician_id: string;
  source_type: string;
  url: string;
  archive_url: string | null;
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

export type RecordActionRow = {
  id: string;
  politician_id: string;
  kind: "vote" | "signed" | "vetoed" | "filed_without_signature" | "sponsored" | "cosponsored" | "executive_order";
  bill_id: string | null;
  title: string;
  what_it_does: string | null;
  position: "yea" | "nay" | "present" | "not_voting" | "absent" | null;
  result: string | null;
  acted_on: string;
  source_name: string;
  source_url: string;
  promise_id: string | null;
  external_id: string;
  /** Set for votes and bills from an earlier office, e.g. "Texas House, District 47 (88th Legislature)". Null means the office tracked now. */
  office_context: string | null;
  created_at: string;
};

/** A topic in the registry. Active topics are checked for every official on every Sync. */
export type TopicRow = {
  code: string;
  label: string;
  keywords: string[];
  related_bills: { session: string; bill: string }[];
  active: boolean;
};

/** A keyword match or bill action waiting for a person to review it. Never a promise by itself. */
export type TopicFindingRow = {
  id: string;
  politician_id: string | null;
  topic: string;
  kind: "page" | "post" | "bill_action";
  url: string;
  excerpt: string;
  keyword: string;
  found_at: string;
  status: "new" | "promoted" | "dismissed";
};

export type UpcomingEventRow = {
  id: string;
  politician_id: string;
  title: string;
  starts_on: string | null;
  when_label: string | null;
  source_name: string;
  source_url: string;
  external_id: string;
  created_at: string;
};

export type ContributionRow = {
  id: string;
  politician_id: string;
  contributor_name: string;
  contributor_city: string | null;
  contributor_state: string | null;
  contributor_employer: string | null;
  amount: number;
  contributed_on: string | null;
  filing_id: string | null;
  source_name: string;
  source_url: string;
  external_id: string;
  created_at: string;
};

export type ContributionSummaryRow = {
  id: string;
  politician_id: string;
  cycle: number;
  receipts: number | null;
  individual_unitemized: number | null;
  individual_itemized: number | null;
  state_itemized_total: number | null;
  in_state_itemized: number | null;
  top_employers: { employer: string; total: number }[];
  coverage_end_date: string | null;
  source_name: string;
  source_url: string;
  updated_at: string;
};

export type VoteTotalRow = {
  item_type: "status_update" | "record_action";
  item_id: string;
  support: number;
  oppose: number;
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
  recordActions: RecordActionRow[];
  upcomingEvents: UpcomingEventRow[];
  contributions: ContributionRow[];
  contributionSummaries: ContributionSummaryRow[];
  voteTotals: VoteTotalRow[];
  topics: TopicRow[];
  topicFindings: TopicFindingRow[];
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
