import { officeTitle } from "@/lib/offices";
import { PROMISE_TYPES, STATUSES, type PromiseType, type Status } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  kept: "Kept",
  partial: "Partial",
  broken: "Broken",
  superseded: "Superseded",
  unverified: "Unverified",
};

const STATUS_HELP: Record<string, string> = {
  pending: "On the record. No public evidence of action yet.",
  in_progress: "A public step has started. The promise is not done.",
  kept: "It happened, and the ledger has evidence.",
  partial: "Some of it happened. The rest did not, or not yet.",
  broken: "The public record shows it did not happen, or the opposite happened.",
  superseded: "A newer promise replaced this one. The new one is tracked too.",
  unverified: "The quote is not yet confirmed against a primary source.",
};

const TYPE_LABELS: Record<string, string> = {
  explicit_pledge: "Explicit pledge",
  platform: "Platform",
};

/**
 * Labels for topics that are not in the topic registry (tx_tracker.tx_topics).
 * A registry row's label always wins, so a topic added there needs no entry here.
 */
const TOPIC_LABELS: Record<string, string> = {
  affordability: "Affordability",
  child_care: "Child care",
  corruption_democracy: "Corruption and democracy",
  data_centers: "Data centers",
  health_care: "Health care",
  housing: "Housing",
  public_education: "Public education",
  save_texas_public_schools: "Save Texas public schools",
  energy_environment: "Energy and the environment",
  foreign_policy: "Foreign policy",
  freedom_family_faith: "Freedom, family, and faith",
  immigration: "Immigration",
  immigration_border_security: "Immigration and border security",
  labor: "Labor",
  labor_business: "Labor and business",
  public_safety_justice: "Public safety and justice",
  rural_investment: "Rural Texas",
  social_media_artificial_intelligence_tech: "Social media, AI, and tech",
  taxes_cost_of_living: "Taxes and the cost of living",
  veterans: "Veterans",
  water: "Water",
};

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

export function isPromiseType(value: string): value is PromiseType {
  return (PROMISE_TYPES as readonly string[]).includes(value);
}

export function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? humanize(status);
}

export function statusHelp(status: string) {
  return STATUS_HELP[status] ?? "A status on this ledger.";
}

export function typeLabel(type: string) {
  return TYPE_LABELS[type] ?? humanize(type);
}

/** The office name, with the district when there is one: "Texas House of Representatives, District 112". */
export function officeLabel(person: { office: string; district?: string | null }) {
  return officeTitle(person);
}

/** Registry labels first, then the fallback list above. Pass the registry's labels when you have them. */
export function topicLabel(topic: string | null, registry: Record<string, string> = {}) {
  if (!topic) return "Unspecified topic";
  return registry[topic] ?? TOPIC_LABELS[topic] ?? humanize(topic);
}

export function humanize(value: string) {
  const text = value.replace(/[_-]+/g, " ").trim();
  if (!text) return value;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function decidedByLabel(value: string) {
  if (value === "human") return "a person";
  if (value === "system_suggest") return "a system suggestion";
  return humanize(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatLongDate(isoDate: string | null) {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatTimestamp(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function tally(rows: { status: string }[]) {
  const counts: Record<string, number> = {};
  for (const status of STATUSES) counts[status] = 0;
  for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}

export function scoredShare(counts: Record<string, number>) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const open = new Set(["pending", "unverified", "in_progress"]);
  let scored = 0;
  for (const [status, count] of Object.entries(counts)) {
    if (!open.has(status)) scored += count;
  }
  return {
    total,
    scored,
    percent: total === 0 ? 0 : Math.round((scored / total) * 100),
  };
}
