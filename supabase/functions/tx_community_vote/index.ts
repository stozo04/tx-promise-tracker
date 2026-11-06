// Community votes for Promise vs. Delivered.
// One vote per IP address per item. The IP is never stored: it is hashed with
// a private salt (tx_tracker.tx_private_settings) and only the hash is kept.
// A second vote from the same address on the same item is refused.
//
// GET  ?items=status_update:<uuid>,record_action:<uuid>  -> your vote + totals for each item
// POST { item_type, item_id, choice: "support" | "oppose" } -> records the vote
import { createClient } from "npm:@supabase/supabase-js@2";

// Only this site may call the vote endpoint from a browser: production, its Vercel
// previews, and local dev. Other sites get no CORS headers, and POSTs from them are refused.
const ALLOWED_ORIGINS = [
  /^https:\/\/tx-promise-tracker\.vercel\.app$/,
  /^https:\/\/tx-promise-tracker-[a-z0-9-]+-steven-gates-projects\.vercel\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
];

function allowedOrigin(origin: string | null) {
  return origin !== null && ALLOWED_ORIGINS.some((pattern) => pattern.test(origin));
}

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!allowedOrigin(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    Vary: "Origin",
  };
}

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  db: { schema: "tx_tracker" },
  auth: { persistSession: false, autoRefreshToken: false },
});

const ITEM_TABLES: Record<string, string> = {
  status_update: "status_updates",
  record_action: "tx_record_actions",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 50;

function reply(cors: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

let saltCache: string | null = null;
async function salt() {
  if (saltCache) return saltCache;
  const { data, error } = await db.from("tx_private_settings").select("value").eq("key", "ip_hash_salt").single();
  if (error || !data) throw new Error("The vote salt is missing.");
  saltCache = data.value as string;
  return saltCache;
}

// Prefer headers the caller cannot set. Cloudflare, in front of Supabase, overwrites
// cf-connecting-ip with the real address. x-forwarded-for comes last because its
// leftmost entry is whatever the caller sent, so it is only a fallback.
const IP_HEADERS = ["cf-connecting-ip", "x-real-ip"] as const;

function clientIp(req: Request): { ip: string | null; source: string } {
  for (const name of IP_HEADERS) {
    const value = req.headers.get(name)?.trim();
    if (value) return { ip: value, source: name };
  }
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return { ip: forwarded.split(",")[0].trim(), source: "x-forwarded-for" };
  return { ip: null, source: "none" };
}

async function ipHash(ip: string) {
  const bytes = new TextEncoder().encode(`${await salt()}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function validItem(type: unknown, id: unknown): type is string {
  return typeof type === "string" && type in ITEM_TABLES && typeof id === "string" && UUID.test(id);
}

async function totalsFor(type: string, ids: string[]) {
  const { data, error } = await db
    .from("tx_community_vote_totals")
    .select("item_id, support, oppose")
    .eq("item_type", type)
    .in("item_id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.item_id as string, { support: row.support as number, oppose: row.oppose as number }]));
}

async function yourVotes(type: string, ids: string[], hash: string) {
  const { data, error } = await db
    .from("tx_community_votes")
    .select("item_id, choice")
    .eq("item_type", type)
    .eq("ip_hash", hash)
    .in("item_id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.item_id as string, row.choice as string]));
}

async function describe(items: { type: string; id: string }[], hash: string | null) {
  const out: Record<string, { your_vote: string | null; support: number; oppose: number }> = {};
  for (const type of Object.keys(ITEM_TABLES)) {
    const ids = items.filter((item) => item.type === type).map((item) => item.id);
    if (ids.length === 0) continue;
    const totals = await totalsFor(type, ids);
    const mine = hash ? await yourVotes(type, ids, hash) : new Map<string, string>();
    for (const id of ids) {
      const total = totals.get(id) ?? { support: 0, oppose: 0 };
      out[`${type}:${id}`] = { your_vote: mine.get(id) ?? null, ...total };
    }
  }
  return out;
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const send = (body: unknown, status = 200) => reply(cors, body, status);

  try {
    const { ip, source } = clientIp(req);
    if (source !== "cf-connecting-ip") console.warn(`Client IP came from ${source}, not cf-connecting-ip.`);
    const hash = ip ? await ipHash(ip) : null;

    if (req.method === "GET") {
      const raw = new URL(req.url).searchParams.get("items") ?? "";
      const items = raw
        .split(",")
        .map((pair) => pair.trim())
        .filter(Boolean)
        .slice(0, MAX_ITEMS)
        .map((pair) => {
          const [type, id] = pair.split(":");
          return { type, id };
        })
        .filter((item) => validItem(item.type, item.id));
      return send({ ok: true, items: await describe(items, hash) });
    }

    if (req.method !== "POST") return send({ ok: false, error: "Use GET or POST." }, 405);
    if (!allowedOrigin(req.headers.get("origin"))) {
      return send({ ok: false, reason: "bad_origin", message: "Votes can only be cast on Promise vs. Delivered." }, 403);
    }
    if (!hash) return send({ ok: false, reason: "no_ip", message: "We could not identify your connection, so the vote was not counted." }, 400);

    let body: { item_type?: unknown; item_id?: unknown; choice?: unknown };
    try {
      body = await req.json();
    } catch {
      return send({ ok: false, error: "Send JSON." }, 400);
    }
    const { item_type, item_id, choice } = body;
    if (!validItem(item_type, item_id) || (choice !== "support" && choice !== "oppose")) {
      return send({ ok: false, error: "item_type, item_id and choice (support or oppose) are required." }, 400);
    }

    const { count } = await db
      .from(ITEM_TABLES[item_type])
      .select("id", { count: "exact", head: true })
      .eq("id", item_id as string);
    if (!count) return send({ ok: false, error: "That item does not exist." }, 404);

    const { error } = await db
      .from("tx_community_votes")
      .insert({ item_type, item_id, choice, ip_hash: hash });

    const state = (await describe([{ type: item_type, id: item_id as string }], hash))[`${item_type}:${item_id}`];
    if (error) {
      if (error.code === "23505") {
        return send({ ok: false, reason: "already_voted", message: "You've already voted on this.", ...state }, 409);
      }
      throw error;
    }
    return send({ ok: true, ...state });
  } catch (error) {
    console.error(error);
    return send({ ok: false, error: "Something went wrong. Try again in a moment." }, 500);
  }
});
