import { json, options } from "@/lib/http";
import { presentPolitician } from "@/lib/present";
import { loadLedger } from "@/lib/queries";
import { NOT_YET_TRACKED } from "@/lib/roadmap";

export function OPTIONS() {
  return options();
}

export async function GET() {
  const ledger = await loadLedger();
  return json({
    ok: true,
    fetched_at: ledger.fetchedAt,
    total: ledger.politicians.length,
    not_yet_tracked: NOT_YET_TRACKED,
    data: ledger.politicians.map(presentPolitician),
  });
}
