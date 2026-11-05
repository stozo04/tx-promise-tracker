import { json, options } from "@/lib/http";
import { politicianMap, presentPromise, presentSnapshot, presentStatusUpdate, snapshotsForPromise } from "@/lib/present";
import { loadLedger } from "@/lib/queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function OPTIONS() {
  return options();
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) {
    return json({ ok: false, error: "Promise id must be a UUID." }, 400);
  }

  const ledger = await loadLedger();
  const promise = ledger.promises.find((row) => row.id === id);
  if (!promise) return json({ ok: false, error: "No promise with that id." }, 404);

  const people = politicianMap(ledger);
  const politician = people.get(promise.politician_id);
  const source = promise.source_id
    ? ledger.sources.find((row) => row.id === promise.source_id) ?? null
    : null;
  const updates = ledger.statusUpdates.filter((update) => update.promise_id === promise.id);

  return json({
    ok: true,
    fetched_at: ledger.fetchedAt,
    data: {
      promise: presentPromise(promise, politician),
      politician: politician ?? null,
      source,
      snapshots: snapshotsForPromise(ledger, promise).map((snapshot) =>
        presentSnapshot(snapshot, ledger.supabaseUrl),
      ),
      status_updates: updates.map(presentStatusUpdate),
    },
  });
}
