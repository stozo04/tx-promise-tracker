// The topic sweep and watched-bill check for tx_sync.
//
// For every active topic in tx_topics:
//   1. Campaign pages. Each official's campaign sitemap (plus politicians.campaign_watch_urls) is
//      listed into tx_watched_pages. Each run reads the pages checked longest ago, up to a cap and a
//      time budget, so a long list finishes over several runs. A page is matched again only when
//      its visible text changed (SHA-256 of the text). Keyword matches go into tx_topic_findings
//      with status 'new'. They are never published as promises: a person confirms the verbatim
//      quote and the source first.
//   2. X posts. Only when an X API bearer token is stored in tx_private_settings (x_bearer_token).
//      Without one, the run notes say so. X is never scraped.
//   3. Watched bills. For each bill in a topic's related_bills, the Texas Legislature Online
//      history is read. House record votes are copied from the House Journal for every tracked
//      official who served in that legislature (tx_legislative_service), labeled with the office
//      they held then. Recent bill actions (filed, passed, signed, vetoed...) become findings.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// The client is created with db.schema "tx_tracker".
// deno-lint-ignore no-explicit-any
type Db = SupabaseClient<any, "public", "tx_tracker", any, any>;

export type Log = {
  counts: Record<string, unknown>;
  errors: { source: string; message: string }[];
  notes: string[];
};

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
  campaign_site_url: string | null;
  campaign_watch_urls: string[] | null;
};

const UA = "PromiseVsDelivered/1.0 (+https://github.com/stozo04/tx-promise-tracker)";
/** Pages read per run. The rest wait for the next run, oldest-checked first. */
const MAX_PAGES_PER_RUN = 80;
/** Stop starting new page reads after this long, so the run ends inside the Edge Function limit. */
const PAGE_TIME_BUDGET_MS = 100_000;
const PAGE_CONCURRENCY = 4;
const MAX_SITEMAP_URLS = 600;
const MAX_FINDINGS_PER_PAGE_TOPIC = 10;
/** Bill actions older than this are history, not news, and are not queued as findings. */
const BILL_ACTION_WINDOW_DAYS = 30;

function bump(log: Log, key: string, by = 1) {
  log.counts[key] = ((log.counts[key] as number | undefined) ?? 0) + by;
}

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

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”",
  ldquo: "“", mdash: "—", ndash: "–", hellip: "…", eacute: "é", aacute: "á", iacute: "í", oacute: "ó",
  uacute: "ú", ntilde: "ñ", copy: "©",
};

export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return ENTITIES[code.toLowerCase()] ?? all;
  });
}

/** The text a visitor sees: no scripts, styles, or markup. Block elements become line breaks. */
export function visibleText(html: string) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/blockquote)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
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
    .slice(0, MAX_FINDINGS_PER_PAGE_TOPIC)
    .map(({ excerpt, keyword, at }) => ({ excerpt, keyword, at }));
}

async function sitemapUrls(url: string, depth = 0): Promise<string[]> {
  const { ok, text } = await fetchText(url);
  if (!ok) return [];
  const locs = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decodeEntities(m[1]));
  if (/<sitemapindex/i.test(text) && depth < 2) {
    const pages: string[] = [];
    for (const child of locs.filter((loc) => !/image|video/i.test(loc))) {
      pages.push(...(await sitemapUrls(child, depth + 1)));
      if (pages.length >= MAX_SITEMAP_URLS) break;
    }
    return pages;
  }
  return locs.filter((loc) => !/\.(jpe?g|png|gif|webp|svg|pdf|mp4|zip)(\?|$)/i.test(loc));
}

/** List every official's campaign pages in tx_watched_pages. New URLs are added; known ones keep their hash. */
async function listPages(db: Db, officials: Official[], log: Log) {
  for (const p of officials) {
    try {
      const rows: { url: string; politician_id: string; origin: string }[] = [];
      if (p.campaign_site_url) {
        const origin = new URL(p.campaign_site_url).origin;
        const urls = await sitemapUrls(`${origin}/sitemap.xml`);
        if (urls.length === 0) log.notes.push(`Topics: no sitemap found for ${p.name} at ${origin}/sitemap.xml.`);
        for (const url of [p.campaign_site_url, ...urls].slice(0, MAX_SITEMAP_URLS)) {
          rows.push({ url, politician_id: p.id, origin: "sitemap" });
        }
      }
      for (const url of p.campaign_watch_urls ?? []) rows.push({ url, politician_id: p.id, origin: "extra" });
      const unique = [...new Map(rows.map((row) => [row.url, row])).values()];
      if (unique.length === 0) continue;
      const { error } = await db.from("tx_watched_pages").upsert(unique, { onConflict: "url", ignoreDuplicates: true });
      if (error) throw new Error(`tx_watched_pages: ${error.message}`);
    } catch (err) {
      log.errors.push({ source: `topics_sitemap:${p.slug}`, message: err instanceof Error ? err.message : String(err) });
    }
  }
}

async function readPages(db: Db, officials: Official[], topics: Topic[], log: Log, startedAt: number) {
  const bySlug = new Map(officials.map((p) => [p.id, p]));
  const { data, error } = await db
    .from("tx_watched_pages")
    .select("url, politician_id, content_hash")
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_PAGES_PER_RUN);
  if (error) throw new Error(`tx_watched_pages: ${error.message}`);
  const queue = [...((data ?? []) as { url: string; politician_id: string; content_hash: string | null }[])];
  log.counts.topic_pages_checked = 0;
  log.counts.topic_pages_changed = 0;

  async function worker() {
    while (queue.length > 0 && Date.now() - startedAt < PAGE_TIME_BUDGET_MS) {
      const page = queue.shift()!;
      const official = bySlug.get(page.politician_id);
      if (!official) continue;
      const now = new Date().toISOString();
      try {
        const res = await fetchText(page.url);
        if (!res.ok) {
          await db.from("tx_watched_pages").update({ http_status: res.status, last_checked_at: now }).eq("url", page.url);
          if (res.status !== 404 && res.status !== 410) {
            log.errors.push({ source: `topics_page:${official.slug}`, message: `${res.status} from ${page.url}` });
          }
          continue;
        }
        const text = visibleText(res.text);
        const hash = await sha256(text);
        bump(log, "topic_pages_checked");
        if (hash === page.content_hash) {
          await db.from("tx_watched_pages").update({ http_status: res.status, last_checked_at: now }).eq("url", page.url);
          continue;
        }
        bump(log, "topic_pages_changed");
        const findings: Record<string, unknown>[] = [];
        for (const topic of topics) {
          const matches = matchTopic(text, topic);
          bumpMatch(log, official.slug, topic.code, matches.length);
          for (const match of matches) {
            findings.push({
              politician_id: official.id,
              topic: topic.code,
              kind: "page",
              url: page.url,
              excerpt: match.excerpt,
              keyword: match.keyword,
              // Keyed on the excerpt, so an unchanged passage on an edited page is not queued twice.
              content_hash: await sha256(match.excerpt),
            });
          }
        }
        if (findings.length > 0) {
          const { error: insertError } = await db
            .from("tx_topic_findings")
            .upsert(findings, { onConflict: "politician_id,topic,url,content_hash", ignoreDuplicates: true });
          if (insertError) throw new Error(`tx_topic_findings: ${insertError.message}`);
        }
        await db
          .from("tx_watched_pages")
          .update({ http_status: res.status, content_hash: hash, last_checked_at: now, last_changed_at: now })
          .eq("url", page.url);
      } catch (err) {
        await db.from("tx_watched_pages").update({ last_checked_at: now }).eq("url", page.url);
        log.errors.push({ source: `topics_page:${official.slug}`, message: `${page.url}: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
  }
  await Promise.all(Array.from({ length: PAGE_CONCURRENCY }, worker));
  if (queue.length > 0) log.notes.push(`Topics: stopped at the time budget; ${queue.length} pages wait for the next run.`);
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
      log.errors.push({ source: `topics_x:${p.slug}`, message: err instanceof Error ? err.message : String(err) });
    }
  }
}

// --- Watched bills: Texas Legislature Online history and House Journal record votes.

type HistoryRow = { chamber: string; description: string; comment: string; date: string; journalHref: string | null };

function cellText(html: string) {
  return decodeEntities(html.replace(/<br\b[^>]*>/gi, " ").replace(/<\/?(td|th|tr|p|div|li)\b[^>]*>/gi, " ").replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

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

/** The HTML day page for a House Journal PDF link. */
export function houseJournalHtml(pdfHref: string) {
  const match = pdfHref.match(/journals\.house\.texas\.gov\/hjrnl\/([^/]+)\/pdf\/([^#?]+)\.pdf/i);
  if (!match) return null;
  return `https://journals.house.texas.gov/HJRNL/${match[1].toUpperCase()}/HTML/${match[2].toUpperCase()}.HTM`;
}

export type RecordVote = {
  question: string;
  result: string | null;
  lists: Record<string, string[]>;
};

const LIST_LABELS: [RegExp, "yea" | "nay" | "present" | "absent"][] = [
  [/^Yeas\b/, "yea"],
  [/^Nays\b/, "nay"],
  [/^Present, not voting\b/, "present"],
  [/^Absent\b/, "absent"],
];

/** Find "(Record N)" in a House Journal day page and read who voted which way. */
export function parseRecordVote(dayHtml: string, record: string): RecordVote | null {
  const paragraphs = dayHtml
    .split(/<\/div>/i)
    .map((chunk) => cellText(chunk))
    .filter(Boolean);
  const at = paragraphs.findIndex((p) => new RegExp(`\\(Record ${record}\\)`).test(p));
  if (at === -1) return null;
  const sentence = paragraphs[at];
  const clause = sentence.split(new RegExp(`\\s*\\(Record ${record}\\)`))[0].replace(/\s+by$/, "").trim();
  // Context: the bill heading ("HB 1181 ON THIRD READING"). Who offered an amendment is not
  // guessed: the nearest "offered the following amendment" line can belong to a different one.
  let heading = "";
  for (let i = at - 1; i >= Math.max(0, at - 400); i--) {
    if (/^(C?S?[HS][BJRC]R?)\s?\d+\b.*\b(READING|AMENDMENTS?|REPORT|CALENDAR)\b/.test(paragraphs[i])) {
      heading = paragraphs[i];
      break;
    }
  }
  const lists: Record<string, string[]> = {};
  for (let i = at + 1; i < Math.min(paragraphs.length, at + 8); i++) {
    const p = paragraphs[i];
    const label = LIST_LABELS.find(([re]) => re.test(p));
    if (!label) break;
    const names = p
      .replace(/^[^—]*—\s*/, "")
      .replace(/\.$/, "")
      .split(";")
      .map((name) => name.replace(/\(C\)$/, "").trim())
      .filter(Boolean);
    lists[label[1]] = [...(lists[label[1]] ?? []), ...names];
  }
  const verb = clause.match(/\b(was|were)\s+(not\s+)?(adopted|passed|tabled|withdrawn)|\b(prevailed|failed|lost)\b/i)?.[0] ?? null;
  const result = verb ? verb.replace(/^(was|were)\s+/i, "").replace(/^./, (c) => c.toUpperCase()) : null;
  const question = [heading ? `${heading.replace(/\s+/g, " ")}.` : "", `${clause}.`].filter(Boolean).join(" ");
  return { question, result, lists };
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** "Texas House, District 47 (88th Legislature)" or "... (89th Legislature, 2nd called session)". */
export function officeContext(district: string, session: string) {
  const legislature = parseInt(session.slice(0, 2), 10);
  const special = session.slice(2);
  const called = /^\d$/.test(special) ? `, ${ordinal(Number(special))} called session` : "";
  return `Texas House, District ${district} (${ordinal(legislature)} Legislature${called})`;
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
      log.errors.push({ source: `bill:${entry.session}:${entry.bill}`, message: err instanceof Error ? err.message : String(err) });
    }
  }
}

/** Check every active topic for every official. Each step fails on its own. */
export async function topicSweep(db: Db, log: Log) {
  const startedAt = Date.now();
  const { data: topicRows, error: topicError } = await db
    .from("tx_topics")
    .select("code, label, keywords, related_bills")
    .eq("active", true);
  if (topicError) throw new Error(`tx_topics: ${topicError.message}`);
  const topics = (topicRows ?? []) as Topic[];
  if (topics.length === 0) {
    log.notes.push("Topics: no active topics in tx_topics.");
    return;
  }
  const { data: people, error: peopleError } = await db
    .from("politicians")
    .select("id, name, slug, x_user_id, x_handle, campaign_site_url, campaign_watch_urls");
  if (peopleError) throw new Error(`politicians: ${peopleError.message}`);
  const officials = (people ?? []) as Official[];
  log.notes.push(`Topics: checked ${topics.map((t) => t.label).join(", ")} for ${officials.map((p) => p.name).join(", ")}.`);

  const steps: [string, () => Promise<void>][] = [
    ["topics_bills", () => checkBills(db, topics, log)],
    ["topics_sitemaps", () => listPages(db, officials, log)],
    ["topics_pages", () => readPages(db, officials, topics, log, startedAt)],
    ["topics_x", () => readPosts(db, officials, topics, log)],
  ];
  for (const [name, run] of steps) {
    try {
      await run();
    } catch (err) {
      log.errors.push({ source: name, message: err instanceof Error ? err.message : String(err) });
    }
  }
}
