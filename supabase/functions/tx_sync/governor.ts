// The governor's actions. Bill signings, vetoes, and bills filed without signature come from the
// Texas Legislature Online governor reports for each session of the legislature, dated from each
// bill's history. Executive orders come from the Office of the Governor's monthly news archive
// (gov.texas.gov/news/archive/YYYY/MM), where each order is posted. Only actions on or after the
// governor's term start are stored. Rows are insert-only.
import { parseReportRows, tloSessions } from "./texas.ts";
import { parseHistory } from "./topics.ts";
import { bump, cellText, checkedItems, type Ctx, decodeEntities, knownIds, markChecked, type Politician, texasLegislature, upsert } from "./shared.ts";

export const GOVERNOR_REPORTS = [
  { id: "signedbygov", kind: "signed", action: /^Signed by the Governor/i },
  { id: "vetoedbygov", kind: "vetoed", action: /^Vetoed by the Governor/i },
  { id: "filedwogovsign", kind: "filed_without_signature", action: /^Filed without the Governor's signature/i },
] as const;

/** The date of the governor's action in a bill's history, or null if it is not there. */
export function governorActionDate(historyHtml: string, action: RegExp) {
  return parseHistory(historyHtml).rows.find((row) => action.test(row.description))?.date ?? null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Every post in one month of the Office of the Governor's news archive. */
export function parseArchivePosts(archiveHtml: string, year: number) {
  const posts: { url: string; title: string; date: string }[] = [];
  for (const item of archiveHtml.split(/<div class="media-object m-b-2/i).slice(1)) {
    const date = cellText(item.match(/class="date date--horiz">([\s\S]*?)<\/div>/i)?.[1] ?? "").match(/^([A-Z][a-z]{2})\s+(\d{1,2})$/);
    const link = item.match(/<a href="([^"]+)" class="readMore">([\s\S]*?)<\/a>/i);
    if (!date || !link) continue;
    const month = MONTHS.indexOf(date[1]) + 1;
    if (month === 0) continue;
    posts.push({ url: decodeEntities(link[1]), title: cellText(link[2]), date: `${year}-${String(month).padStart(2, "0")}-${date[2].padStart(2, "0")}` });
  }
  return posts;
}

/**
 * The executive orders a post publishes, found by each order's own PDF on gov.texas.gov
 * (".../EO-GA-57_....pdf"), which the post links through an email-tracking redirect. A post that
 * only mentions an executive order (for example a statement on a federal one) has no such PDF.
 * One post can publish more than one order (GA-53 and GA-54 were announced together).
 */
export function executiveOrdersIn(postHtml: string) {
  let text = postHtml;
  for (let i = 0; i < 2; i++) {
    try {
      text = decodeURIComponent(text);
    } catch {
      text = text.replace(/%([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    }
  }
  const orders = new Map<string, { number: string; pdfUrl: string }>();
  for (const pdf of text.matchAll(/https?:\/\/gov\.texas\.gov\/uploads\/files\/press\/(EO-([A-Z]{2,3}-\d+)[^"'&<>\s]*?\.pdf)/gi)) {
    const number = pdf[2].toUpperCase();
    if (!orders.has(number)) orders.set(number, { number, pdfUrl: `https://gov.texas.gov/uploads/files/press/${pdf[1]}` });
  }
  return [...orders.values()];
}

/**
 * Texas governors number their orders with their initials (GA-57 is Greg Abbott's 57th). An order
 * with another prefix that a post links to belongs to an earlier governor and is not this one's record.
 */
export function ordersPrefix(name: string) {
  const words = name.trim().split(/\s+/);
  return `${words[0][0]}${words.at(-1)![0]}`.toUpperCase();
}

/** Months from the term start through this month, as "YYYY/MM". */
export function monthsSince(termStart: string, today: Date) {
  const months: string[] = [];
  let y = Number(termStart.slice(0, 4));
  let m = Number(termStart.slice(5, 7));
  const endY = today.getUTCFullYear();
  const endM = today.getUTCMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}/${String(m).padStart(2, "0")}`);
    m === 12 ? ((y += 1), (m = 1)) : (m += 1);
  }
  return months;
}

const MAX_HISTORIES_PER_CALL = 80;
const MAX_POSTS_PER_CALL = 80;

export async function governorActions(ctx: Ctx, p: Politician) {
  if (!p.term_start || ctx.now < new Date(`${p.term_start}T00:00:00Z`)) {
    ctx.log.notes.push(`Governor: ${p.name} has not taken office yet.`);
    return false;
  }
  let more = false;

  // Signed, vetoed, filed without signature.
  const billsBy = await ctx.http.text("https://capitol.texas.gov/Reports/BillsBy.aspx", 30_000);
  if (!billsBy.ok) throw new Error(`${billsBy.status} from capitol.texas.gov/Reports/BillsBy.aspx`);
  const notTheirs = `governor_bills:${p.slug}`;
  const skipped = await checkedItems(ctx.db, notTheirs);
  let budget = MAX_HISTORIES_PER_CALL;
  for (const session of tloSessions(billsBy.text, texasLegislature(ctx.now))) {
    for (const report of GOVERNOR_REPORTS) {
      const url = `https://capitol.texas.gov/Reports/Report.aspx?LegSess=${session}&ID=${report.id}`;
      const res = await ctx.http.text(url, 60_000);
      if (!res.ok) throw new Error(`${res.status} from ${url}`);
      const bills = parseReportRows(res.text);
      const id = (bill: string) => `gov:${session}:${bill.replace(" ", "")}:${report.kind}:${p.slug}`;
      const stored = await knownIds(ctx.db, bills.map((b) => id(b.bill)));
      const fresh = bills.filter((b) => !stored.has(id(b.bill)) && !skipped.has(id(b.bill)));
      const rows: Record<string, unknown>[] = [];
      const before: string[] = [];
      for (const b of fresh) {
        if (budget <= 0 || Date.now() > ctx.deadline) {
          more = true;
          break;
        }
        budget--;
        const historyUrl = `https://capitol.texas.gov/BillLookup/History.aspx?LegSess=${session}&Bill=${b.bill.replace(" ", "")}`;
        const history = await ctx.http.text(historyUrl, 30_000);
        const date = history.ok ? governorActionDate(history.text, report.action) : null;
        if (!date) continue;
        // An action by the previous governor in the same session is not this official's record.
        if (date < p.term_start) {
          before.push(id(b.bill));
          continue;
        }
        rows.push({
          politician_id: p.id,
          kind: report.kind,
          bill_id: b.bill,
          title: b.caption || `${session} ${b.bill}`,
          acted_on: date,
          source_name: "Texas Legislature Online",
          source_url: historyUrl,
          external_id: id(b.bill),
        });
      }
      bump(ctx.log, "governor_actions", await upsert(ctx.db, "tx_record_actions", rows, "external_id", true));
      await markChecked(ctx.db, notTheirs, before);
    }
  }

  // Executive orders. Each post is read once; finished months are remembered.
  const doneMonths = `governor_eo_months:${p.slug}`;
  const readPosts = `governor_posts:${p.slug}`;
  const done = await checkedItems(ctx.db, doneMonths);
  const seenPosts = await checkedItems(ctx.db, readPosts);
  const thisMonth = `${ctx.now.getUTCFullYear()}/${String(ctx.now.getUTCMonth() + 1).padStart(2, "0")}`;
  let postBudget = MAX_POSTS_PER_CALL;
  for (const month of monthsSince(p.term_start, ctx.now).filter((m) => !done.has(m))) {
    if (Date.now() > ctx.deadline || postBudget <= 0) {
      more = true;
      break;
    }
    const url = `https://gov.texas.gov/news/archive/${month}`;
    const res = await ctx.http.text(url, 30_000);
    if (!res.ok) throw new Error(`${res.status} from ${url}`);
    // Oldest first: rows are insert-only, so an order's first announcement sets its date.
    const posts = parseArchivePosts(res.text, Number(month.slice(0, 4)))
      .filter((post) => post.date >= p.term_start! && !seenPosts.has(post.url))
      .reverse();
    const rows: Record<string, unknown>[] = [];
    const read: string[] = [];
    for (const post of posts) {
      if (Date.now() > ctx.deadline || postBudget <= 0) break;
      postBudget--;
      const page = await ctx.http.text(post.url, 30_000);
      if (!page.ok) continue;
      read.push(post.url);
      for (const order of executiveOrdersIn(page.text)) {
        if (rows.some((row) => row.bill_id === order.number)) continue;
        if (!order.number.startsWith(`${ordersPrefix(p.name)}-`)) {
          ctx.log.notes.push(`Governor: ${post.url} links Executive Order ${order.number}, which does not carry ${p.name}'s initials; it was not stored.`);
          continue;
        }
        rows.push({
          politician_id: p.id,
          kind: "executive_order",
          bill_id: order.number,
          title: `Executive Order ${order.number}`,
          what_it_does: `Announced by the Office of the Governor as "${post.title}".`,
          acted_on: post.date,
          source_name: "Office of the Governor",
          source_url: order.pdfUrl,
          external_id: `gov_eo:${order.number}`,
        });
      }
    }
    bump(ctx.log, "executive_orders", await upsert(ctx.db, "tx_record_actions", rows, "external_id", true));
    await markChecked(ctx.db, readPosts, read);
    if (read.length < posts.length) {
      more = true;
      break;
    }
    if (month !== thisMonth) await markChecked(ctx.db, doneMonths, [month]);
  }
  return more;
}
