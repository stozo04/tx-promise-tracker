import { filterPromises } from "@/lib/filters";
import { json, one, options, paging } from "@/lib/http";
import { politicianMap, presentPromise } from "@/lib/present";
import { loadLedger } from "@/lib/queries";
import { NOT_YET_TRACKED } from "@/lib/roadmap";

export function OPTIONS() {
  return options();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = paging(url);
  if ("error" in page) return json({ ok: false, error: page.error }, 400);

  const ledger = await loadLedger();
  const query = {
    politician: one(url, "politician"),
    topic: one(url, "topic"),
    status: one(url, "status"),
    type: one(url, "type"),
    q: one(url, "q"),
    source: one(url, "source"),
  };
  const scoped = filterPromises(ledger.promises, ledger.politicians, {
    politician: query.politician,
  });
  if (scoped.error) {
    return json({ ok: false, error: scoped.error.message, allowed: scoped.error.allowed }, scoped.error.status);
  }

  const result = filterPromises(ledger.promises, ledger.politicians, query);
  if (result.error) {
    return json({ ok: false, error: result.error.message, allowed: result.error.allowed }, result.error.status);
  }

  const topics = [...new Set(scoped.promises.map((promise) => promise.topic).filter(Boolean))].sort();
  const people = politicianMap(ledger);
  const data = result.promises
    .slice(page.offset, page.offset + page.limit)
    .map((promise) => presentPromise(promise, people.get(promise.politician_id)));

  return json({
    ok: true,
    fetched_at: ledger.fetchedAt,
    total: result.promises.length,
    limit: page.limit,
    offset: page.offset,
    topics,
    not_yet_tracked: NOT_YET_TRACKED,
    data,
  });
}
