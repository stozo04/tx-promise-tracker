// Texas sources for state officials: every House record vote in the House Journal, and the bills a
// member authored or co-authored on Texas Legislature Online. Rows are insert-only: a stored row
// (including one checked by hand) is never overwritten.
import { JOURNAL_API, officeContext, parseJournalDays, positionOf, recordVotesInDay } from "./journal.ts";
import {
  bump,
  cellText,
  checkedItems,
  type Ctx,
  decodeEntities,
  knownIds,
  markChecked,
  ordinal,
  type Politician,
  texasLegislature,
  upsert,
  usDate,
} from "./shared.ts";

export type Service = {
  politician_id: string;
  chamber: "house" | "senate";
  legislature: number;
  district: string;
  journal_name: string;
  tlo_member_code: string | null;
};

/** House Journal days read per official per run. The rest wait for the next run, oldest first. */
export const MAX_JOURNAL_DAYS_PER_RUN = 25;

async function currentService(ctx: Ctx, p: Politician, chamber: "house" | "senate") {
  const legislature = texasLegislature(ctx.now);
  const { data, error } = await ctx.db
    .from("tx_legislative_service")
    .select("politician_id, chamber, legislature, district, journal_name, tlo_member_code")
    .eq("politician_id", p.id)
    .eq("chamber", chamber)
    .eq("legislature", legislature)
    .maybeSingle();
  if (error) throw new Error(`tx_legislative_service: ${error.message}`);
  return { legislature, service: data as Service | null };
}

function notInOffice(ctx: Ctx, p: Politician) {
  return !p.term_start || ctx.now < new Date(`${p.term_start}T00:00:00Z`);
}

/** Rows for every record vote on one House Journal day for one member. */
export function houseVoteRows(dayHtml: string, day: { session: string; date: string; htmlUrl: string }, p: Pick<Politician, "id" | "slug">, s: Pick<Service, "journal_name" | "district">) {
  const rows: Record<string, unknown>[] = [];
  for (const vote of recordVotesInDay(dayHtml)) {
    const position = positionOf(vote, s.journal_name);
    if (!position) continue;
    rows.push({
      politician_id: p.id,
      kind: "vote",
      bill_id: vote.bill,
      title: vote.bill ? `${vote.bill} (${day.session})` : `Record vote ${vote.record} (${day.session})`,
      what_it_does: `Record vote ${vote.record}: ${vote.question}`,
      position,
      result: vote.result,
      acted_on: day.date,
      source_name: "Texas House Journal",
      source_url: day.htmlUrl,
      external_id: `house:${day.session}:${vote.record}:${p.slug}`,
      office_context: officeContext(s.district, day.session),
    });
  }
  return rows;
}

/** A1: every record vote in the House Journal for the member's current term, not only watched bills. */
export async function houseJournal(ctx: Ctx, p: Politician) {
  if (notInOffice(ctx, p)) {
    ctx.log.notes.push(`House Journal: ${p.name} has not taken office yet.`);
    return;
  }
  const { legislature, service } = await currentService(ctx, p, "house");
  if (!service) {
    ctx.log.notes.push(`House Journal: no tx_legislative_service row for ${p.name} in the ${ordinal(legislature)} Legislature. Add it from the Legislative Reference Library.`);
    return;
  }
  const days = parseJournalDays(await ctx.http.json(`${JOURNAL_API}/journals-for-legislature/${legislature}/H`).catch(() => []), "H").filter(
    (day) => day.date >= p.term_start!,
  );
  if (days.length === 0) {
    ctx.log.notes.push(`House Journal: no journal days published for the ${ordinal(legislature)} Legislature yet.`);
    return;
  }
  const source = `house_journal:${p.slug}`;
  const done = await checkedItems(ctx.db, source);
  const pending = days.filter((day) => !done.has(day.htmlUrl));
  let read = 0;
  for (const day of pending.slice(0, MAX_JOURNAL_DAYS_PER_RUN)) {
    if (Date.now() > ctx.deadline) break;
    const res = await ctx.http.text(day.htmlUrl, 60_000);
    if (!res.ok) throw new Error(`${res.status} from ${day.htmlUrl}`);
    const rows = houseVoteRows(res.text, day, p, service);
    bump(ctx.log, "house_votes", await upsert(ctx.db, "tx_record_actions", rows, "external_id", true));
    await markChecked(ctx.db, source, [day.htmlUrl]);
    read++;
  }
  bump(ctx.log, "house_journal_days", read);
  return pending.length > read;
}

// --- A2: bills a member authored or co-authored, from the Texas Legislature Online reports.

export type AuthoredBill = { bill: string; role: "author" | "joint_author" | "coauthor"; caption: string; lastAction: string | null };

/** The bill rows of any TLO report (Bills by Author, Signed by the Governor, ...). */
export function parseReportRows(html: string) {
  const rows: { bill: string; caption: string; lastAction: string | null }[] = [];
  for (const row of html.split(/<div class="row">/i).slice(1)) {
    const bill = row.match(/History\.aspx\?LegSess=[^&"]+&(?:amp;)?Bill=([A-Z]+)(\d+)/);
    if (!bill) continue;
    const cells = [...row.matchAll(/<div class="bill-search-result-(?:label|data)">([\s\S]*?)<\/div>/gi)].map((m) => cellText(m[1]));
    const after = (label: string) => {
      const at = cells.findIndex((text) => text.startsWith(label));
      return at === -1 ? null : cells[at + 1] ?? null;
    };
    rows.push({ bill: `${bill[1]} ${bill[2]}`, caption: after("Caption") ?? "", lastAction: after("Last Action") });
  }
  return rows;
}

/** Rows of a TLO "Bills by Author" or "Bills by Coauthor" report. */
export function parseAuthorReport(html: string, report: "author" | "coauthor"): AuthoredBill[] {
  const bills: AuthoredBill[] = [];
  // The author report has sections at <a name="author"> and <a name="jointauthor">. The coauthor
  // report has one unnamed list.
  const parts = report === "coauthor" ? ["", "coauthor", html] : html.split(/<a name="(author|jointauthor)"><\/a>/i);
  for (let i = 1; i < parts.length; i += 2) {
    const section = parts[i].toLowerCase();
    const role = report === "coauthor" ? "coauthor" : section === "jointauthor" ? "joint_author" : "author";
    for (const row of parseReportRows(parts[i + 1])) bills.push({ ...row, role });
  }
  return bills;
}

/** The date a member was added as author, joint author, or coauthor, from the bill's Authors page. */
export function authorDate(html: string, journalName: string, role: AuthoredBill["role"]) {
  const tables = html.split(/<div role="table"/i).slice(1);
  const label = role === "coauthor" ? /coauthors/i : role === "joint_author" ? /jointAuthors|joint author/i : /primaryAuthors|primary author/i;
  for (const table of tables) {
    if (!label.test(table.slice(0, 300))) continue;
    for (const row of table.split(/<div role="row">/i).slice(1)) {
      const cells = [...row.matchAll(/<span role="cell">([\s\S]*?)<\/span>/gi)].map((m) => decodeEntities(m[1]).replace(/\s+/g, " ").trim());
      if (cells[0] === journalName && cells[1]) return usDate(cells[1]);
    }
  }
  return null;
}

/** Session codes of a legislature that TLO lists ("90R", "901", ...), from the Bills By page. */
export function tloSessions(billsByHtml: string, legislature: number) {
  const select = billsByHtml.match(/<select name="cboLegSess"[\s\S]*?<\/select>/i)?.[0] ?? "";
  return [...select.matchAll(/value="(\d{2}[R\d])"/g)].map((m) => m[1]).filter((code) => code.startsWith(String(legislature)));
}

const MAX_NEW_BILLS_PER_RUN = 60;

export async function tloBills(ctx: Ctx, p: Politician) {
  if (notInOffice(ctx, p)) {
    ctx.log.notes.push(`Texas Legislature Online: ${p.name} has not taken office yet.`);
    return;
  }
  const { legislature, service } = await currentService(ctx, p, "house");
  if (!service) {
    ctx.log.notes.push(`Texas Legislature Online: no tx_legislative_service row for ${p.name} in the ${ordinal(legislature)} Legislature.`);
    return;
  }
  if (!service.tlo_member_code) {
    ctx.log.notes.push(
      `Texas Legislature Online: no member code is stored for ${p.name} in the ${ordinal(legislature)} Legislature (tx_legislative_service.tlo_member_code). Add it from capitol.texas.gov/Reports/BillsBy.aspx once the member is listed.`,
    );
    return;
  }
  const billsBy = await ctx.http.text("https://capitol.texas.gov/Reports/BillsBy.aspx", 30_000);
  if (!billsBy.ok) throw new Error(`${billsBy.status} from capitol.texas.gov/Reports/BillsBy.aspx`);
  let added = 0;
  let waiting = 0;
  for (const session of tloSessions(billsBy.text, legislature)) {
    for (const report of ["author", "coauthor"] as const) {
      const url = `https://capitol.texas.gov/Reports/Report.aspx?LegSess=${session}&ID=${report}&Code=${service.tlo_member_code}`;
      const res = await ctx.http.text(url, 30_000);
      if (!res.ok) throw new Error(`${res.status} from ${url}`);
      const bills = parseAuthorReport(res.text, report);
      const id = (b: AuthoredBill) => `tlo:${session}:${b.bill.replace(" ", "")}:${b.role}:${p.slug}`;
      const stored = await knownIds(ctx.db, bills.map(id));
      const fresh = bills.filter((b) => !stored.has(id(b)));
      const rows: Record<string, unknown>[] = [];
      for (const b of fresh) {
        if (added + rows.length >= MAX_NEW_BILLS_PER_RUN || Date.now() > ctx.deadline) {
          waiting++;
          continue;
        }
        const authorsUrl = `https://capitol.texas.gov/BillLookup/Authors.aspx?LegSess=${session}&Bill=${b.bill.replace(" ", "")}`;
        const page = await ctx.http.text(authorsUrl, 30_000);
        const date = page.ok ? authorDate(page.text, service.journal_name, b.role) : null;
        if (!date) {
          ctx.log.notes.push(`Texas Legislature Online: no ${b.role.replace("_", " ")} date for ${service.journal_name} on ${session} ${b.bill}; it will be retried.`);
          continue;
        }
        rows.push({
          politician_id: p.id,
          kind: b.role === "coauthor" ? "cosponsored" : "sponsored",
          bill_id: b.bill,
          title: b.caption || `${session} ${b.bill}`,
          acted_on: date,
          source_name: "Texas Legislature Online",
          source_url: authorsUrl,
          external_id: id(b),
          office_context: officeContext(service.district, session),
        });
      }
      added += await upsert(ctx.db, "tx_record_actions", rows, "external_id", true);
    }
  }
  bump(ctx.log, "tlo_bills", added);
  return waiting > 0;
}
