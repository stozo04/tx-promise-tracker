// Sync for Promise vs. Delivered. One run per 24 hours for the whole site, covering
// every official and every active topic in tx_topics (see topics.ts).
// The cooldown is claimed atomically in Postgres (tx_tracker.tx_claim_sync).
// Each source runs on its own; a failure is written to the run's errors and
// does not stop the others. Records are copied from primary sources only.
import { createClient } from "npm:@supabase/supabase-js@2";

import { type Log, topicSweep } from "./topics.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const UA = "PromiseVsDelivered/1.0 (+https://github.com/stozo04/tx-promise-tracker)";
// The api.data.gov key (Congress.gov and FEC). An Edge Function secret wins;
// otherwise it is read from tx_private_settings, which only service_role can read.
let DATA_GOV_KEY = Deno.env.get("TX_DATA_GOV_API_KEY") ?? "";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  db: { schema: "tx_tracker" },
  auth: { persistSession: false, autoRefreshToken: false },
});

type Politician = {
  id: string;
  name: string;
  slug: string;
  office: string;
  election_date: string | null;
  term_start: string | null;
};

function add(log: Log, key: string, by: number) {
  log.counts[key] = ((log.counts[key] as number | undefined) ?? 0) + by;
}

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

async function getJson(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).hostname}${new URL(url).pathname}`);
  return res.json();
}

async function getText(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).hostname}${new URL(url).pathname}`);
  return res.text();
}

function lastName(name: string) {
  return name.trim().split(/\s+/).at(-1)!.toLowerCase();
}

function cycleFor(p: Politician) {
  const year = Number((p.election_date ?? new Date().toISOString()).slice(0, 4));
  return year % 2 === 0 ? year : year + 1;
}

async function upsert(table: string, rows: Record<string, unknown>[], conflict: string) {
  if (rows.length === 0) return 0;
  const { error } = await db.from(table).upsert(rows, { onConflict: conflict });
  if (error) throw new Error(`${table}: ${error.message}`);
  return rows.length;
}

// Values donors put in the employer box that are not an employer.
const NOT_AN_EMPLOYER =
  /^(NOT[ -]?EMPLOYED|UNEMPLOYED|NONE|NULL|N\/?A|SELF[ -]?EMPLOYED|SELF|RETIRED|HOMEMAKER|STUDENT|INFORMATION REQUESTED.*|REQUESTED|-+)$/i;

// --- FEC: totals, where the money came from, and the largest itemized gifts.
async function fec(p: Politician, log: Log) {
  if (!DATA_GOV_KEY) throw new Error("The api.data.gov key is not set (TX_DATA_GOV_API_KEY or tx_private_settings.data_gov_api_key).");
  const base = "https://api.open.fec.gov/v1";
  const key = `api_key=${DATA_GOV_KEY}`;
  const cycle = cycleFor(p);
  const search = await getJson(`${base}/candidates/search/?q=${encodeURIComponent(lastName(p.name))}&office=S&state=TX&${key}`);
  const candidate = (search.results ?? []).find((row: { name: string }) => row.name.toLowerCase().includes(lastName(p.name)));
  if (!candidate) {
    log.notes.push(`FEC: no Senate candidate found for ${p.name}.`);
    return;
  }
  const committeeId: string | undefined = candidate.principal_committees?.[0]?.committee_id;
  const totals = (await getJson(`${base}/candidate/${candidate.candidate_id}/totals/?cycle=${cycle}&${key}`)).results?.[0];

  let stateTotal: number | null = null;
  let inState: number | null = null;
  let employers: { employer: string; total: number }[] = [];
  if (committeeId) {
    const byState = (await getJson(`${base}/schedules/schedule_a/by_state/?committee_id=${committeeId}&cycle=${cycle}&per_page=100&${key}`)).results ?? [];
    stateTotal = byState.reduce((sum: number, row: { total: number }) => sum + row.total, 0);
    inState = byState.filter((row: { state: string }) => row.state === "TX").reduce((sum: number, row: { total: number }) => sum + row.total, 0);
    // Fetch extra rows, then drop answers that are not an employer ("NOT EMPLOYED", "NONE", "NULL"...)
    // so the list shows the ten largest real employers.
    employers = ((await getJson(`${base}/schedules/schedule_a/by_employer/?committee_id=${committeeId}&cycle=${cycle}&sort=-total&per_page=50&${key}`)).results ?? [])
      .filter((row: { employer: string | null }) => row.employer && !NOT_AN_EMPLOYER.test(row.employer.trim()))
      .slice(0, 10)
      .map((row: { employer: string; total: number }) => ({ employer: row.employer, total: row.total }));
  }

  await upsert(
    "tx_contribution_summaries",
    [
      {
        politician_id: p.id,
        cycle,
        receipts: totals?.receipts ?? null,
        individual_unitemized: totals?.individual_unitemized_contributions ?? null,
        individual_itemized: totals?.individual_itemized_contributions ?? null,
        state_itemized_total: stateTotal,
        in_state_itemized: inState,
        top_employers: employers,
        coverage_end_date: totals?.coverage_end_date?.slice(0, 10) ?? null,
        source_name: "Federal Election Commission",
        source_url: `https://www.fec.gov/data/candidate/${candidate.candidate_id}/?cycle=${cycle}`,
        updated_at: new Date().toISOString(),
      },
    ],
    "politician_id,cycle",
  );
  add(log, "fec_summaries", 1);

  if (!committeeId) return;
  const gifts = (await getJson(
    `${base}/schedules/schedule_a/?committee_id=${committeeId}&two_year_transaction_period=${cycle}&is_individual=true&sort=-contribution_receipt_amount&per_page=100&${key}`,
  )).results ?? [];
  const rows = gifts
    .filter((row: { sub_id?: string; contributor_name?: string }) => row.sub_id && row.contributor_name)
    .map((row: Record<string, unknown>) => ({
      politician_id: p.id,
      contributor_name: row.contributor_name,
      contributor_city: row.contributor_city ?? null,
      contributor_state: row.contributor_state ?? null,
      contributor_employer: row.contributor_employer ?? null,
      amount: row.contribution_receipt_amount,
      contributed_on: row.contribution_receipt_date ?? null,
      filing_id: row.file_number ? String(row.file_number) : null,
      source_name: "Federal Election Commission",
      source_url: (row.pdf_url as string) ?? `https://www.fec.gov/data/receipts/?committee_id=${committeeId}`,
      external_id: `fec:${row.sub_id}`,
    }));
  add(log, "fec_contributions", await upsert("tx_contributions", rows, "external_id"));
}

// --- Congress.gov: bills the senator sponsored or co-sponsored.
const BILL_SLUGS: Record<string, string> = {
  S: "senate-bill",
  SRES: "senate-resolution",
  SJRES: "senate-joint-resolution",
  SCONRES: "senate-concurrent-resolution",
  HR: "house-bill",
  HRES: "house-resolution",
  HJRES: "house-joint-resolution",
  HCONRES: "house-concurrent-resolution",
};
function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

async function congress(p: Politician, log: Log) {
  if (!DATA_GOV_KEY) throw new Error("The api.data.gov key is not set (TX_DATA_GOV_API_KEY or tx_private_settings.data_gov_api_key).");
  const key = `api_key=${DATA_GOV_KEY}`;
  const members = (await getJson(`https://api.congress.gov/v3/member/TX?currentMember=true&limit=250&format=json&${key}`)).members ?? [];
  const member = members.find((row: { name: string }) => row.name.toLowerCase().includes(lastName(p.name)));
  if (!member) {
    log.notes.push(`Congress.gov: ${p.name} is not listed as a current member yet.`);
    return;
  }
  for (const [path, field, kind] of [
    ["sponsored-legislation", "sponsoredLegislation", "sponsored"],
    ["cosponsored-legislation", "cosponsoredLegislation", "cosponsored"],
  ] as const) {
    const bills = (await getJson(`https://api.congress.gov/v3/member/${member.bioguideId}/${path}?limit=250&format=json&${key}`))[field] ?? [];
    const rows = bills
      .filter((bill: { number?: string; type?: string; congress?: number }) => bill.number && bill.type && bill.congress)
      .map((bill: { congress: number; type: string; number: string; title?: string; introducedDate?: string }) => ({
        politician_id: p.id,
        kind,
        bill_id: `${bill.type} ${bill.number}`,
        title: bill.title ?? `${bill.type} ${bill.number}`,
        acted_on: bill.introducedDate ?? new Date().toISOString().slice(0, 10),
        source_name: "Congress.gov",
        source_url: `https://www.congress.gov/bill/${ordinal(bill.congress)}-congress/${BILL_SLUGS[bill.type.toUpperCase()] ?? "senate-bill"}/${bill.number}`,
        external_id: `congress:${bill.congress}:${bill.type}:${bill.number}:${kind}`,
      }));
    add(log, `congress_${kind}`, await upsert("tx_record_actions", rows, "external_id"));
  }
}

// --- Senate roll-call votes, read from the Senate's own XML.
function tag(xml: string, name: string) {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? match[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim() : null;
}
function allBlocks(xml: string, name: string) {
  return [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1]);
}
const POSITIONS: Record<string, string> = { yea: "yea", nay: "nay", present: "present", "not voting": "not_voting" };
const MAX_VOTES_PER_SYNC = 40;

async function senateVotes(p: Politician, log: Log) {
  if (!p.term_start || new Date() < new Date(`${p.term_start}T00:00:00Z`)) {
    log.notes.push(`Senate votes: ${p.name} has not taken office yet.`);
    return;
  }
  const year = new Date().getUTCFullYear();
  const congressNo = Math.floor((year - 1789) / 2) + 1;
  const session = year % 2 === 1 ? 1 : 2;
  const menu = await getText(`https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congressNo}_${session}.xml`);
  if (!menu) {
    log.notes.push(`Senate votes: no roll calls published for the ${ordinal(congressNo)} Congress, session ${session}, yet.`);
    return;
  }
  const { data: known } = await db
    .from("tx_record_actions")
    .select("external_id")
    .like("external_id", `senate:${congressNo}:${session}:%`);
  const seen = new Set((known ?? []).map((row: { external_id: string }) => row.external_id));
  const votes = allBlocks(menu, "vote")
    .map((block) => ({ number: tag(block, "vote_number"), title: tag(block, "title"), result: tag(block, "result") }))
    .filter((vote) => vote.number && !seen.has(`senate:${congressNo}:${session}:${vote.number}`))
    .slice(0, MAX_VOTES_PER_SYNC);

  const rows: Record<string, unknown>[] = [];
  for (const vote of votes) {
    const padded = vote.number!.padStart(5, "0");
    const folder = `vote${congressNo}${session}`;
    const xml = await getText(`https://www.senate.gov/legislative/LIS/roll_call_votes/${folder}/vote_${congressNo}_${session}_${padded}.xml`);
    if (!xml) continue;
    const member = allBlocks(xml, "member").find(
      (block) => tag(block, "last_name")?.toLowerCase() === lastName(p.name) && tag(block, "state") === "TX",
    );
    if (!member) continue;
    const cast = (tag(member, "vote_cast") ?? "").toLowerCase();
    const date = tag(xml, "vote_date");
    const parsed = date ? new Date(date.split(",").slice(0, 2).join(",")) : null;
    rows.push({
      politician_id: p.id,
      kind: "vote",
      bill_id: tag(xml, "document_name") || null,
      title: tag(xml, "vote_title") || tag(xml, "question") || vote.title || `Roll call ${vote.number}`,
      what_it_does: tag(xml, "vote_question_text") || null,
      position: POSITIONS[cast] ?? null,
      result: tag(xml, "vote_result") || vote.result,
      acted_on: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      source_name: "U.S. Senate roll call",
      source_url: `https://www.senate.gov/legislative/LIS/roll_call_votes/${folder}/vote_${congressNo}_${session}_${padded}.htm`,
      external_id: `senate:${congressNo}:${session}:${vote.number}`,
    });
  }
  add(log, "senate_votes", await upsert("tx_record_actions", rows, "external_id"));
}

async function loadDataGovKey() {
  if (DATA_GOV_KEY) return;
  const { data } = await db.from("tx_private_settings").select("value").eq("key", "data_gov_api_key").maybeSingle();
  DATA_GOV_KEY = (data?.value as string | undefined) ?? "";
}

async function runSync(runId: string) {
  const log: Log = { counts: {}, errors: [], notes: [] };
  try {
    await loadDataGovKey();
    const { data: politicians, error } = await db.from("politicians").select("id, name, slug, office, election_date, term_start");
    if (error) throw error;
    for (const p of (politicians ?? []) as Politician[]) {
      const sources =
        p.office === "us_senate"
          ? ([["fec", fec], ["congress", congress], ["senate_votes", senateVotes]] as const)
          : ([] as const);
      if (p.office === "governor") {
        log.notes.push(
          `${p.name}: Texas Legislature Online, the Office of the Governor and the Texas Ethics Commission are not automated yet. Their records are added by hand.`,
        );
      }
      if (p.office === "tx_lt_governor") {
        log.notes.push(
          `${p.name}: the Texas Senate Journal and the Texas Ethics Commission are not automated yet. Earlier Texas House votes on watched bills are read by the topic sweep.`,
        );
      }
      if (p.office === "tx_house") {
        log.notes.push(
          `${p.name}: Texas House record votes for the new term and the Texas Ethics Commission are not automated yet. Votes on watched bills are read by the topic sweep.`,
        );
      }
      for (const [name, run] of sources) {
        try {
          await run(p, log);
        } catch (err) {
          log.errors.push({ source: `${name}:${p.slug}`, message: err instanceof Error ? err.message : String(err) });
        }
      }
    }
  } catch (err) {
    log.errors.push({ source: "sync", message: err instanceof Error ? err.message : String(err) });
  }
  try {
    await topicSweep(db, log);
  } catch (err) {
    log.errors.push({ source: "sync", message: err instanceof Error ? err.message : String(err) });
  } finally {
    await db
      .from("ingest_runs")
      .update({ finished_at: new Date().toISOString(), counts: log.counts, errors: log.errors, notes: log.notes.join("\n") || null })
      .eq("id", runId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return reply({ ok: false, error: "Use POST." }, 405);

  const { data, error } = await db.rpc("tx_claim_sync");
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
        reason: "cooldown",
        last_synced_at: claim?.last_started_at ?? null,
        retry_after_seconds: Math.ceil(wait / 1000),
        message: `Someone synced recently. Please wait ${formatWait(wait)} before syncing again.`,
      },
      429,
      { "Retry-After": String(Math.ceil(wait / 1000)) },
    );
  }

  // @ts-ignore EdgeRuntime is provided by Supabase.
  EdgeRuntime.waitUntil(runSync(claim.run_id));
  return reply(
    {
      ok: true,
      last_synced_at: claim.last_started_at,
      message: "Sync started for every official and topic. New records show up on the site within a few minutes.",
    },
    202,
  );
});
