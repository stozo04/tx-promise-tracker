import { tally } from "@/lib/format";
import { json, options } from "@/lib/http";
import { presentPolitician } from "@/lib/present";
import { loadLedger, politicianBySlug } from "@/lib/queries";
import { NOT_YET_TRACKED } from "@/lib/roadmap";
import { termClock } from "@/lib/term";
import { PROMISE_TYPES, STATUSES } from "@/lib/types";

export function OPTIONS() {
  return options();
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ledger = await loadLedger();
  const politician = politicianBySlug(ledger, slug);
  if (!politician) {
    return json(
      {
        ok: false,
        error: `No politician with slug "${slug}".`,
        allowed: ledger.politicians.map((person) => person.slug),
      },
      404,
    );
  }

  const rows = ledger.promises.filter((promise) => promise.politician_id === politician.id);
  const byStatus = tally(rows);
  for (const status of STATUSES) byStatus[status] = byStatus[status] ?? 0;

  const byType: Record<string, number> = {};
  for (const type of PROMISE_TYPES) byType[type] = 0;
  const byTopic: Record<string, number> = {};
  for (const promise of rows) {
    byType[promise.promise_type] = (byType[promise.promise_type] ?? 0) + 1;
    const topic = promise.topic ?? "unspecified";
    byTopic[topic] = (byTopic[topic] ?? 0) + 1;
  }

  const clock = termClock(politician.term_start, new Date(ledger.fetchedAt));

  return json({
    ok: true,
    fetched_at: ledger.fetchedAt,
    politician: presentPolitician(politician),
    total: rows.length,
    by_status: byStatus,
    by_type: byType,
    by_topic: byTopic,
    term: {
      election_date: politician.election_date,
      term_start: politician.term_start,
      timezone: "America/Chicago",
      as_of: clock.asOf,
      phase: clock.phase,
      days_until_term: clock.daysUntilTerm,
      days_in_office: clock.daysInOffice,
    },
    not_yet_tracked: NOT_YET_TRACKED,
  });
}
