import { filterPromises } from "@/lib/filters";
import { json, one, options, paging } from "@/lib/http";
import { politicianMap, presentSource } from "@/lib/present";
import { loadLedger } from "@/lib/queries";

export function OPTIONS() {
  return options();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = paging(url);
  if ("error" in page) return json({ ok: false, error: page.error }, 400);

  const ledger = await loadLedger();
  const politician = one(url, "politician");
  let sources = ledger.sources;
  if (politician) {
    const match = filterPromises(ledger.promises, ledger.politicians, { politician });
    if (match.error) {
      return json({ ok: false, error: match.error.message, allowed: match.error.allowed }, match.error.status);
    }
    const person = ledger.politicians.find((row) => row.slug === politician.toLowerCase());
    sources = sources.filter((source) => source.politician_id === person?.id);
  }

  const people = politicianMap(ledger);
  const data = sources
    .slice(page.offset, page.offset + page.limit)
    .map((source) => presentSource(source, people.get(source.politician_id)));

  return json({
    ok: true,
    fetched_at: ledger.fetchedAt,
    total: sources.length,
    limit: page.limit,
    offset: page.offset,
    data,
  });
}
