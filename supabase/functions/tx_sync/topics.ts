// The topic sweep and watched-bill check for tx_sync.
//
// For every active topic in tx_topics:
//   1. Watched bills. For each bill in a topic's related_bills, the Texas Legislature Online
//      history is read. House record votes are copied from the House Journal for every tracked
//      official who served in that legislature (tx_legislative_service), labeled with the office
//      they held then. Recent bill actions (filed, passed, signed, vetoed...) become findings.
//   2. X posts. Only when an X API bearer token is stored in tx_private_settings (x_bearer_token).
//      Without one, the run notes say so. X is never scraped.
//
// Campaign sites are no longer read: the campaigns are over, and the pages and findings already
// captured (tx_watched_pages, tx_topic_findings of kind 'page') stay as the record of what each
// official stood for.
import { houseJournalHtml, officeContext, parseRecordVote } from "./journal.ts";
import { bump, type Ctx, cellText, type Db, decodeEntities, type Log, message, UA } from "./shared.ts";

type Topic = {
  code: string;
  label: string;
  keywords: string[];
  related_bills: { session: string; bill: string }[];
};

type Official = {
  id: string;
  name: string;
  slug: string;
  x_user_id: string | null;
  x_handle: string | null;
};

const MAX_FINDINGS_PER_TEXT_TOPIC = 10;
/** Bill actions older than this are history, not news, and are not queued as findings. */
const BILL_ACTION_WINDOW_DAYS = 30;

function bumpMatch(log: Log, slug: string, topic: string, by: number) {
  const all = (log.counts.topic_matches ??= {}) as Record<string, Record<string, number>>;
  const row = (all[slug] ??= {});
  row[topic] = (row[topic] ?? 0) + by;
}

async function sha256(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchText(url: string, timeoutMs = 20_000) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xml;q=0.9,*/*;q=0.8" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  return { status: res.status, ok: res.ok, text: res.ok ? await res.text() : "" };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-word matcher for one keyword. An all-caps keyword (an acronym like THC, or a bill number
 * like HB 1181) matches case-sensitively, so "THC" never matches inside "healthcare".
 */
export function keywordPattern(keyword: string) {
  const exact = /[A-Z]/.test(keyword) && keyword === keyword.toUpperCase();
  const body = escapeRegex(keyword).replace(/\\?[ -]/g, "[\\s\\u00a0-]+");
  return new RegExp(`(?<![A-Za-z0-9])${body}(?![A-Za-z0-9])`, exact ? "g" : "gi");
}

/** The sentence (or about 400 characters) around a match, and where it sits in the text. */
function excerptAround(text: string, start: number, end: number) {
  const lineStart = text.lastIndexOf("\n", start) + 1;
  const lineEndRaw = text.indexOf("\n", end);
  const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
  let from = Math.max(lineStart, start - 240);
  let to = Math.min(lineEnd, end + 240);
  if (from > lineStart) {
    const sentence = text.slice(from, start).search(/[.!?]\s+[A-Z“"]/);
    from = sentence === -1 ? from : from + sentence + 2;
  }
  if (to < lineEnd) {
    const tail = text.slice(end, to).match(/^[\s\S]*?[.!?](?=\s|$)/);
    to = tail ? end + tail[0].length : to;
  }
  return { from, to, excerpt: `${from > lineStart ? "…" : ""}${text.slice(from, to).trim()}${to < lineEnd ? "…" : ""}` };
}

/** Every passage in the text that mentions one of the topic's keywords, one per distinct excerpt. */
export function matchTopic(text: string, topic: Pick<Topic, "keywords">) {
  const found: { excerpt: string; keyword: string; at: number; from: number; to: number }[] = [];
  for (const keyword of topic.keywords) {
    for (const match of text.matchAll(keywordPattern(keyword))) {
      const at = match.index ?? 0;
      // A second keyword inside a passage already found is the same finding.
      if (found.some((row) => at >= row.from && at < row.to)) continue;
      const { from, to, excerpt } = excerptAround(text, at, at + match[0].length);
      if (found.some((row) => row.excerpt === excerpt)) continue;
      found.push({ excerpt, keyword, at, from, to });
    }
  }
  return found
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_FINDINGS_PER_TEXT_TOPIC)
    .map(({ excerpt, keyword, at }) => ({ excerpt, keyword, at }));
}

async function readPosts(db: Db, officials: Official[], topics: Topic[], log: Log) {
  const { data } = await db.from("tx_private_settings").select("value").eq("key", "x_bearer_token").maybeSingle();
  const token = (data?.value as string | undefined) ?? "";
  if (!token) {
    log.notes.push("Topics: X posts were not checked. No X API credential is stored (tx_private_settings.x_bearer_token). X is never scraped.");
    return;
  }
  for (const p of officials) {
    if (!p.x_user_id || !p.x_handle) continue;
    try {
      const res = await fetch(
        `https://api.x.com/2/users/${p.x_user_id}/tweets?max_results=100&exclude=retweets&tweet.fields=created_at,note_tweet`,
        { headers: { Authorization: `Bearer ${token}`, "User-Agent": UA }, signal: AbortSignal.timeout(20_000) },
      );
      if (!res.ok) throw new Error(`${res.status} from api.x.com`);
      const body = (await res.json()) as { data?: { id: string; text: string; note_tweet?: { text: string } }[] };
      const findings: Record<string, unknown>[] = [];
      for (const post of body.data ?? []) {
        const text = post.note_tweet?.text ?? post.text;
        for (const topic of topics) {
          const matches = matchTopic(text, topic);
          if (matches.length === 0) continue;
          bumpMatch(log, p.slug, topic.code, 1);
          findings.push({
            politician_id: p.id,
            topic: topic.code,
            kind: "post",
            url: `https://x.com/${p.x_handle}/status/${post.id}`,
            excerpt: text,
            keyword: matches[0].keyword,
            content_hash: await sha256(text),
          });
        }
      }
      bump(log, "topic_posts_checked", body.data?.length ?? 0);
      if (findings.length > 0) {
        const { error } = await db
          .from("tx_topic_findings")
          .upsert(findings, { onConflict: "politician_id,topic,url,content_hash", ignoreDuplicates: true });
        if (error) throw new Error(`tx_topic_findings: ${error.message}`);
      }
    } catch (err) {
      log.errors.push({ source: `topics_x:${p.slug}`, message: message(err) });
    }
  }
}

// --- Watched bills: Texas Legislature Online history and House Journal record votes.

type HistoryRow = { chamber: string; description: string; comment: string; date: string; journalHref: string | null };

export function parseHistory(html: string) {
  const caption = cellText(html.match(/id="lblCaptionText"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "") || null;
  const rows: HistoryRow[] = [];
  for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<td[^>]*data-label="([^"]+)"[^>]*>([\s\S]*?)<\/td>/gi)];
    const get = (label: string) => cells.find((c) => c[1] === label)?.[2] ?? "";
    if (!cells.length || !get("Action Description")) continue;
    const href = get("Action Description").match(/href="([^"]+)"/)?.[1] ?? null;
    const [mm, dd, yyyy] = cellText(get("Action Date")).split("/");
    if (!yyyy) continue;
    rows.push({
      chamber: cellText(get("Action Chamber")),
      description: cellText(get("Action Description")),
      comment: cellText(get("Action Comment")),
      date: `${yyyy}-${mm}-${dd}`,
      journalHref: href ? decodeEntities(href) : null,
    });
  }
  return { caption, rows };
}

function billLabel(bill: string) {
  return bill.replace(/^([A-Z]+)\s*(\d+)$/, "$1 $2");
}

async function checkBills(db: Db, topics: Topic[], log: Log) {
  const watched = new Map<string, { session: string; bill: string; topics: string[] }>();
  for (const topic of topics) {
    for (const row of topic.related_bills ?? []) {
      const key = `${row.session}:${row.bill.replace(/\s+/g, "").toUpperCase()}`;
      const entry = watched.get(key) ?? { session: row.session, bill: row.bill.replace(/\s+/g, "").toUpperCase(), topics: [] };
      entry.topics.push(topic.code);
      watched.set(key, entry);
    }
  }
  log.counts.topic_bills_checked = 0;
  if (watched.size === 0) return;

  const { data: service, error } = await db
    .from("tx_legislative_service")
    .select("politician_id, chamber, legislature, district, journal_name, politicians(slug)")
    .eq("chamber", "house");
  if (error) throw new Error(`tx_legislative_service: ${error.message}`);
  const members = (service ?? []) as unknown as {
    politician_id: string;
    legislature: number;
    district: string;
    journal_name: string;
    politicians: { slug: string } | null;
  }[];
  const days = new Map<string, string>();
  const cutoff = new Date(Date.now() - BILL_ACTION_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const KEY_ACTIONS = /^(Filed|Passed|Signed by the Governor|Vetoed by the Governor|Filed without the Governor's signature|Effective|Sent to the Governor|Received from the (House|Senate)|Reported favorably|Placed on General State Calendar|House concurs|Senate concurs)/;

  for (const entry of watched.values()) {
    const historyUrl = `https://capitol.texas.gov/BillLookup/History.aspx?LegSess=${entry.session}&Bill=${entry.bill}`;
    try {
      const res = await fetchText(historyUrl, 30_000);
      if (!res.ok) throw new Error(`${res.status} from capitol.texas.gov`);
      const { caption, rows } = parseHistory(res.text);
      if (rows.length === 0) throw new Error("no actions found on the history page");
      bump(log, "topic_bills_checked");

      // Recent actions become findings for each topic that watches the bill.
      const actions: Record<string, unknown>[] = [];
      for (const row of rows.filter((r) => r.date >= cutoff && KEY_ACTIONS.test(r.description))) {
        const excerpt = `${entry.session} ${billLabel(entry.bill)}: ${row.description}${row.comment ? ` (${row.comment})` : ""}, ${row.chamber === "H" ? "House" : row.chamber === "S" ? "Senate" : "Executive"}, ${row.date}.`;
        for (const topic of entry.topics) {
          actions.push({ politician_id: null, topic, kind: "bill_action", url: historyUrl, excerpt, keyword: row.description, content_hash: await sha256(excerpt) });
          bumpMatch(log, "watched-bills", topic, 1);
        }
      }
      if (actions.length > 0) {
        const { error: insertError } = await db
          .from("tx_topic_findings")
          .upsert(actions, { onConflict: "politician_id,topic,url,content_hash", ignoreDuplicates: true });
        if (insertError) throw new Error(`tx_topic_findings: ${insertError.message}`);
      }

      // House record votes for tracked officials who served in that legislature.
      const legislature = parseInt(entry.session.slice(0, 2), 10);
      const served = members.filter((m) => m.legislature === legislature && m.politicians?.slug);
      if (served.length === 0) continue;
      const votes = rows.filter((r) => r.chamber === "H" && /^Record vote$/i.test(r.description) && /RV#\d+/.test(r.comment));
      const ids = votes.flatMap((v) => served.map((m) => `house:${entry.session}:${v.comment.match(/RV#(\d+)/)![1]}:${m.politicians!.slug}`));
      const { data: known } = await db.from("tx_record_actions").select("external_id").in("external_id", ids);
      const seen = new Set((known ?? []).map((row: { external_id: string }) => row.external_id));
      const inserts: Record<string, unknown>[] = [];
      for (const vote of votes) {
        const number = vote.comment.match(/RV#(\d+)/)![1];
        const pending = served.filter((m) => !seen.has(`house:${entry.session}:${number}:${m.politicians!.slug}`));
        if (pending.length === 0) continue;
        const dayUrl = vote.journalHref ? houseJournalHtml(vote.journalHref) : null;
        if (!dayUrl) {
          log.notes.push(`Bills: no House Journal link for ${entry.session} ${entry.bill} RV#${number}.`);
          continue;
        }
        if (!days.has(dayUrl)) {
          const day = await fetchText(dayUrl, 60_000);
          if (!day.ok) throw new Error(`${day.status} from ${dayUrl}`);
          days.set(dayUrl, day.text);
        }
        const parsed = parseRecordVote(days.get(dayUrl)!, number);
        if (!parsed) {
          log.notes.push(`Bills: Record ${number} was not found in ${dayUrl}.`);
          continue;
        }
        for (const member of pending) {
          const position = (Object.entries(parsed.lists).find(([, names]) => names.includes(member.journal_name)) ?? [])[0];
          if (!position) {
            log.notes.push(`Bills: ${member.journal_name} is not listed on Record ${number} (${entry.session} ${entry.bill}).`);
            continue;
          }
          inserts.push({
            politician_id: member.politician_id,
            kind: "vote",
            bill_id: billLabel(entry.bill),
            title: caption ?? `${entry.session} ${billLabel(entry.bill)}`,
            what_it_does: `Record vote ${number}: ${parsed.question}`,
            position,
            result: parsed.result,
            acted_on: vote.date,
            source_name: "Texas House Journal",
            source_url: dayUrl,
            external_id: `house:${entry.session}:${number}:${member.politicians!.slug}`,
            office_context: officeContext(member.district, entry.session),
          });
        }
      }
      if (inserts.length > 0) {
        // Insert only. Rows already stored (including hand-checked ones) are never overwritten.
        const { error: voteError } = await db
          .from("tx_record_actions")
          .upsert(inserts, { onConflict: "external_id", ignoreDuplicates: true });
        if (voteError) throw new Error(`tx_record_actions: ${voteError.message}`);
        bump(log, "house_votes", inserts.length);
      }
    } catch (err) {
      log.errors.push({ source: `bill:${entry.session}:${entry.bill}`, message: message(err) });
    }
  }
}

async function loadSweep(db: Db) {
  const { data: topicRows, error: topicError } = await db
    .from("tx_topics")
    .select("code, label, keywords, related_bills")
    .eq("active", true);
  if (topicError) throw new Error(`tx_topics: ${topicError.message}`);
  const { data: people, error: peopleError } = await db
    .from("politicians")
    .select("id, name, slug, x_user_id, x_handle");
  if (peopleError) throw new Error(`politicians: ${peopleError.message}`);
  return { topics: (topicRows ?? []) as Topic[], officials: (people ?? []) as Official[] };
}

/**
 * The topic sweep's steps, in order. Each runs in its own request and fails on its own. A step
 * that returns true has more to do, and the run calls it again while time is left.
 */
export const TOPIC_STEPS: { key: string; run: (ctx: Ctx) => Promise<boolean | void> }[] = [
  {
    key: "topics_bills",
    run: async (ctx) => {
      const { topics, officials } = await loadSweep(ctx.db);
      if (topics.length === 0) {
        ctx.log.notes.push("Topics: no active topics in tx_topics.");
        return;
      }
      ctx.log.notes.push(`Topics: checked ${topics.map((t) => t.label).join(", ")} for ${officials.map((p) => p.name).join(", ")}.`);
      await checkBills(ctx.db, topics, ctx.log);
    },
  },
  {
    key: "topics_x",
    run: async (ctx) => {
      const { topics, officials } = await loadSweep(ctx.db);
      if (topics.length > 0) await readPosts(ctx.db, officials, topics, ctx.log);
    },
  },
];
