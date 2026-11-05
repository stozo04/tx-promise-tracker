import { isPromiseType, isStatus, topicLabel } from "@/lib/format";
import { PROMISE_TYPES, STATUSES, type Politician, type PromiseRow } from "@/lib/types";
import { normalizeUrl } from "@/lib/urls";

export type PromiseQuery = {
  politician?: string | null;
  topic?: string | null;
  status?: string | null;
  type?: string | null;
  q?: string | null;
  source?: string | null;
};

export type FilterError = {
  status: 400 | 404;
  message: string;
  allowed?: string[];
};

export function filterPromises(
  promises: PromiseRow[],
  politicians: Politician[],
  query: PromiseQuery,
): { promises: PromiseRow[]; error?: FilterError } {
  let rows = promises;

  if (query.politician) {
    const slug = query.politician.trim().toLowerCase();
    const politician = politicians.find((person) => person.slug === slug);
    if (!politician) {
      return {
        promises: [],
        error: {
          status: 404,
          message: `No politician with slug "${query.politician}".`,
          allowed: politicians.map((person) => person.slug),
        },
      };
    }
    rows = rows.filter((promise) => promise.politician_id === politician.id);
  }

  if (query.status) {
    const status = query.status.trim().toLowerCase();
    if (!isStatus(status)) {
      return {
        promises: [],
        error: {
          status: 400,
          message: "Unknown status.",
          allowed: [...STATUSES],
        },
      };
    }
    rows = rows.filter((promise) => promise.status === status);
  }

  if (query.type) {
    const type = query.type.trim().toLowerCase();
    if (!isPromiseType(type)) {
      return {
        promises: [],
        error: {
          status: 400,
          message: "Unknown promise type. Use explicit_pledge or platform.",
          allowed: [...PROMISE_TYPES],
        },
      };
    }
    rows = rows.filter((promise) => promise.promise_type === type);
  }

  if (query.topic) {
    const topic = query.topic.trim().toLowerCase();
    rows = rows.filter((promise) => (promise.topic ?? "").toLowerCase() === topic);
  }

  if (query.source) {
    const source = normalizeUrl(query.source);
    rows = rows.filter((promise) => normalizeUrl(promise.source_url) === source);
  }

  const needle = query.q?.trim().toLowerCase();
  if (needle) {
    rows = rows.filter((promise) => {
      const haystack = [
        promise.summary_text,
        promise.verbatim_quote,
        promise.notes ?? "",
        promise.topic ?? "",
        promise.topic ? topicLabel(promise.topic) : "",
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  return { promises: rows };
}
