// Sync for Promise vs. Delivered. One run per calendar day (Central time) for the whole site,
// started by the Sync button or, if nobody pressed it, by the nightly job at 11:30 pm CT
// (tx_tracker.tx_nightly_sync). The day is claimed atomically in Postgres (tx_tracker.tx_claim_sync).
//
// Edge Functions get 2 seconds of CPU per request, so the run is split into stages. The public
// request claims the day and replies; its background task then calls this same function once per
// stage (one source for one official, or one topic step), each with its own CPU budget, signed with
// a key only this function can read (tx_private_settings.sync_stage_key). A stage that fails or
// times out is written to the run's errors and the next stage still runs. A stage call can hand a
// carry (for example, where a long file's read stopped) to the calls after it in the same run.
// The registry in sources.ts decides which stages run and which sources the notes call "not automated".
import { createClient } from "npm:@supabase/supabase-js@2";

import { type Ctx, http, type Log, mergeLog, message, type Politician } from "./shared.ts";
import { notAutomatedNotes, SOURCES, sourcesFor } from "./sources.ts";
import { MAX_RATE_LIMIT_RETRIES, rateLimitRetryMs, sleep, slotWaitMs } from "./stage_pacing.ts";
import { TOPIC_STEPS } from "./topics.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
/** The whole run must end inside the 400-second wall clock of a paid plan. */
const RUN_BUDGET_MS = 370_000;
/** One stage request must answer inside the 150-second request idle timeout. */
const STAGE_BUDGET_MS = 120_000;
/** How many times a stage that still has work is called again in one run. */
const MAX_REPEATS = 20;

const SELF_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/tx_sync`;
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  db: { schema: "tx_tracker" },
  auth: { persistSession: false, autoRefreshToken: false },
});

const POLITICIAN_COLUMNS = "id, name, slug, office, election_date, term_start, fec_candidate_id, bioguide_id, lis_member_id, tec_filer_id, campaign_events_url";

function reply(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

function formatWait(ms: number) {
  const total = Math.ceil(ms / 60_000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${Math.max(m, 1)}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

async function setting(key: string) {
  const { data } = await db.from("tx_private_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as string | undefined) ?? "";
}

type Stage = { type: "source"; key: string; slug: string } | { type: "topic"; key: string };
type StageRequest = { runId: string; runStartedAt: string; deadline: number; stage: Stage; carry?: Record<string, unknown> };
type StageReply = { log: Log; more: boolean; carry: Record<string, unknown> };

/** Run one stage in this request. */
async function runStage(req: StageRequest): Promise<StageReply> {
  const log: Log = { counts: {}, errors: [], notes: [] };
  const ctx: Ctx = {
    db,
    http,
    log,
    dataGovKey: Deno.env.get("TX_DATA_GOV_API_KEY") || (await setting("data_gov_api_key")),
    now: new Date(),
    runStartedAt: new Date(req.runStartedAt).toISOString(),
    deadline: Math.min(req.deadline, Date.now() + STAGE_BUDGET_MS),
    carry: req.carry ?? {},
  };
  let more = false;
  try {
    if (req.stage.type === "topic") {
      const step = TOPIC_STEPS.find((s) => s.key === req.stage.key);
      if (!step) throw new Error(`unknown topic step ${req.stage.key}`);
      more = (await step.run(ctx)) === true;
    } else {
      const { slug } = req.stage;
      const source = SOURCES.find((s) => s.key === req.stage.key);
      if (!source?.run) throw new Error(`unknown source ${req.stage.key}`);
      const { data, error } = await db.from("politicians").select(POLITICIAN_COLUMNS).eq("slug", slug).single();
      if (error) throw new Error(`politicians: ${error.message}`);
      more = (await source.run(ctx, data as Politician)) === true;
    }
  } catch (err) {
    const name = req.stage.type === "source" ? `${req.stage.key}:${req.stage.slug}` : req.stage.key;
    log.errors.push({ source: name, message: message(err) });
  }
  return { log, more, carry: ctx.carry };
}

/** The background task: every stage in order, each in its own request, then close the run log. */
async function runSync(runId: string, runStartedAt: string) {
  const log: Log = { counts: {}, errors: [], notes: [] };
  const deadline = Date.now() + RUN_BUDGET_MS;
  let carry: Record<string, unknown> = {};
  try {
    const stageKey = await setting("sync_stage_key");
    if (!stageKey) throw new Error("tx_private_settings.sync_stage_key is missing; stages cannot be called.");
    const { data, error } = await db.from("politicians").select(POLITICIAN_COLUMNS);
    if (error) throw new Error(`politicians: ${error.message}`);
    const politicians = (data ?? []) as Politician[];
    log.notes.push(...notAutomatedNotes(politicians));

    const stages: Stage[] = [
      ...politicians.flatMap((p) =>
        sourcesFor(p.office)
          .filter((s) => s.run)
          .map((s): Stage => ({ type: "source", key: s.key, slug: p.slug })),
      ),
      ...TOPIC_STEPS.map((s): Stage => ({ type: "topic", key: s.key })),
    ];
    const callStarts: number[] = [];
    for (const stage of stages) {
      let rateLimited = 0;
      for (let attempt = 0; attempt < MAX_REPEATS; ) {
        const wait = slotWaitMs(callStarts, Date.now());
        if (Date.now() + wait > deadline - 5_000) {
          log.notes.push(`Sync: the run's time was up before ${stage.type === "source" ? `${stage.key} for ${stage.slug}` : stage.key} finished; it continues next run.`);
          break;
        }
        if (wait > 0) await sleep(wait);
        callStarts.push(Date.now());
        attempt++;
        const name = stage.type === "source" ? `${stage.key}:${stage.slug}` : stage.key;
        try {
          const res = await fetch(SELF_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-tx-stage": stageKey },
            body: JSON.stringify({ runId, runStartedAt, deadline, stage, carry } satisfies StageRequest),
            signal: AbortSignal.timeout(STAGE_BUDGET_MS + 25_000),
          });
          if (!res.ok) throw new Error(`stage returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
          const body = (await res.json()) as StageReply;
          mergeLog(log, body.log);
          carry = body.carry ?? carry;
          if (!body.more) break;
        } catch (err) {
          const retryMs = rateLimitRetryMs(err);
          if (retryMs !== null && rateLimited < MAX_RATE_LIMIT_RETRIES) {
            rateLimited++;
            attempt--;
            await sleep(retryMs);
            continue;
          }
          log.errors.push({ source: name, message: message(err) });
          break;
        }
      }
    }
  } catch (err) {
    log.errors.push({ source: "sync", message: message(err) });
  } finally {
    await db
      .from("ingest_runs")
      .update({ finished_at: new Date().toISOString(), counts: log.counts, errors: log.errors, notes: log.notes.join("\n") || null })
      .eq("id", runId);
  }
}

function sameKey(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return reply({ ok: false, error: "Use POST." }, 405);

  // A stage call from this function's own background task.
  const stageHeader = req.headers.get("x-tx-stage");
  if (stageHeader !== null) {
    if (!sameKey(stageHeader, await setting("sync_stage_key"))) return reply({ ok: false, error: "Not allowed." }, 403);
    return reply(await runStage((await req.json()) as StageRequest));
  }

  // The public request: the Sync button, or the nightly job (body {"trigger":"schedule"}).
  const body = (await req.json().catch(() => ({}))) as { trigger?: string };
  const trigger = body.trigger === "schedule" ? "schedule" : "button";
  const { data, error } = await db.rpc("tx_claim_sync", { p_trigger: trigger });
  if (error) {
    console.error(error);
    return reply({ ok: false, error: "Could not start a sync." }, 500);
  }
  const claim = (data ?? [])[0] as { run_id: string | null; last_started_at: string; next_allowed_at: string } | undefined;
  if (!claim?.run_id) {
    const wait = Math.max(0, Date.parse(claim?.next_allowed_at ?? "") - Date.now());
    return reply(
      {
        ok: false,
        reason: "already_synced_today",
        last_synced_at: claim?.last_started_at ?? null,
        retry_after_seconds: Math.ceil(wait / 1000),
        message: `Sync already ran today. The next one can start after midnight Central time, in ${formatWait(wait)}.`,
      },
      429,
      { "Retry-After": String(Math.ceil(wait / 1000)) },
    );
  }

  // @ts-ignore EdgeRuntime is provided by Supabase.
  EdgeRuntime.waitUntil(runSync(claim.run_id, claim.last_started_at));
  return reply(
    {
      ok: true,
      last_synced_at: claim.last_started_at,
      message: "Sync started for every official and topic. New records show up on the site within a few minutes.",
    },
    202,
  );
});
