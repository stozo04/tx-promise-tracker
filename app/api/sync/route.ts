import { latestIngestRun } from "@/lib/queries";
import { cooldownRemaining, formatWait } from "@/lib/sync";

const NO_STORE = { "Cache-Control": "no-store" };

/** Where the sync cooldown stands right now. */
export async function GET() {
  const run = await latestIngestRun();
  const remaining = cooldownRemaining(run?.started_at ?? null, Date.now());
  return Response.json(
    {
      ok: true,
      last_synced_at: run?.started_at ?? null,
      can_sync: remaining === 0,
      retry_after_seconds: Math.ceil(remaining / 1000),
    },
    { headers: NO_STORE },
  );
}

/**
 * Ask for a sync. Allowed once every 24 hours for the whole site.
 * Inside the cooldown it answers 429 with how long to wait.
 * Outside it, it answers 503 until the ingest pipeline is connected (phase 2).
 */
export async function POST() {
  const run = await latestIngestRun();
  const remaining = cooldownRemaining(run?.started_at ?? null, Date.now());
  if (remaining > 0) {
    const seconds = Math.ceil(remaining / 1000);
    return Response.json(
      {
        ok: false,
        reason: "cooldown",
        last_synced_at: run?.started_at ?? null,
        retry_after_seconds: seconds,
        message: `Someone synced recently. Please wait ${formatWait(remaining)} before syncing again.`,
      },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(seconds) } },
    );
  }
  return Response.json(
    {
      ok: false,
      reason: "not_connected",
      last_synced_at: run?.started_at ?? null,
      message: "The sync pipeline is not connected yet. Records are still loaded by hand.",
    },
    { status: 503, headers: NO_STORE },
  );
}
