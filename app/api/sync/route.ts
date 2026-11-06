import { latestIngestRun } from "@/lib/queries";
import { cooldownRemaining } from "@/lib/sync";

/**
 * Where the site-wide sync cooldown stands. Read only.
 * The sync itself runs in the tx_sync Supabase Edge Function, which claims
 * the once-a-day slot in Postgres so two requests cannot both start one.
 */
export async function GET() {
  const run = await latestIngestRun();
  const remaining = cooldownRemaining(run?.started_at ?? null, Date.now());
  return Response.json(
    {
      ok: true,
      last_synced_at: run?.started_at ?? null,
      can_sync: remaining === 0,
      retry_after_seconds: Math.ceil(remaining / 1000),
      sync_endpoint: "POST {NEXT_PUBLIC_SUPABASE_URL}/functions/v1/tx_sync",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
