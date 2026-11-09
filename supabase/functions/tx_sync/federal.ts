// Federal sources for the U.S. Senate seat: the FEC, Congress.gov, and Senate roll calls.
// Every lookup uses an ID stored on the official (politicians.fec_candidate_id, bioguide_id,
// lis_member_id). Nothing is matched on a name, so a second person with the same last name can
// never be attached to the wrong record.
import {
  bump,
  checkedItems,
  type Ctx,
  type Http,
  knownIds,
  markChecked,
  ordinal,
  type Politician,
  upsert,
} from "./shared.ts";

function needKey(ctx: Ctx) {
  if (!ctx.dataGovKey) throw new Error("The api.data.gov key is not set (TX_DATA_GOV_API_KEY or tx_private_settings.data_gov_api_key).");
  return `api_key=${ctx.dataGovKey}`;
}

/**
 * Which FEC two-year cycles to load. The rule: the cycle of the election the official won, plus
 * every cycle after it up to the one that holds today. So the 2026 winner loads 2026 until the end
 * of 2026, then 2026 and 2028 during 2027-2028, and so on through the term. Fundraising for the next
 * election shows up as soon as its cycle starts, and the winning cycle stays on the site.
 */
export function fecCycles(electionDate: string | null, today: Date) {
  const even = (year: number) => (year % 2 === 0 ? year : year + 1);
  const current = even(today.getUTCFullYear());
  const won = electionDate ? even(Number(electionDate.slice(0, 4))) : current;
  const cycles: number[] = [];
  for (let cycle = won; cycle <= Math.max(won, current); cycle += 2) cycles.push(cycle);
  return cycles;
}

// Values donors put in the employer box that are not an employer.
const NOT_AN_EMPLOYER =
  /^(NOT[ -]?EMPLOYED|UNEMPLOYED|NONE|NULL|N\/?A|SELF[ -]?EMPLOYED|SELF|RETIRED|HOMEMAKER|STUDENT|INFORMATION REQUESTED.*|REQUESTED|-+)$/i;

type Json = Record<string, unknown> & { results?: Record<string, unknown>[] };

/** FEC: totals, where the money came from, and the largest itemized gifts, for each cycle. */
export async function fec(ctx: Ctx, p: Politician) {
  const key = needKey(ctx);
  if (!p.fec_candidate_id) {
    ctx.log.notes.push(`FEC: no fec_candidate_id is stored for ${p.name}. Add it from fec.gov/data/candidates.`);
    return;
  }
  const base = "https://api.open.fec.gov/v1";
  // The principal campaign committee (designation P) receives the itemized gifts.
  const committees = ((await ctx.http.json(`${base}/candidate/${p.fec_candidate_id}/committees/?designation=P&${key}`)) as Json).results ?? [];
  const committeeId = committees[0]?.committee_id as string | undefined;
  if (!committeeId) ctx.log.notes.push(`FEC: no principal committee is listed for ${p.fec_candidate_id}; only totals were read.`);

  for (const cycle of fecCycles(p.election_date, ctx.now)) {
    const totals = ((await ctx.http.json(`${base}/candidate/${p.fec_candidate_id}/totals/?cycle=${cycle}&${key}`)) as Json).results?.[0] as
      | Record<string, number | string | null>
      | undefined;
    if (!totals && cycle !== fecCycles(p.election_date, ctx.now)[0]) {
      ctx.log.notes.push(`FEC: no ${cycle} totals for ${p.name} yet.`);
      continue;
    }
    let stateTotal: number | null = null;
    let inState: number | null = null;
    let employers: { employer: string; total: number }[] = [];
    if (committeeId) {
      const byState = (((await ctx.http.json(`${base}/schedules/schedule_a/by_state/?committee_id=${committeeId}&cycle=${cycle}&per_page=100&${key}`)) as Json)
        .results ?? []) as { state: string; total: number }[];
      stateTotal = byState.reduce((sum, row) => sum + row.total, 0);
      inState = byState.filter((row) => row.state === "TX").reduce((sum, row) => sum + row.total, 0);
      employers = ((((await ctx.http.json(
        `${base}/schedules/schedule_a/by_employer/?committee_id=${committeeId}&cycle=${cycle}&sort=-total&per_page=50&${key}`,
      )) as Json).results ?? []) as { employer: string | null; total: number }[])
        .filter((row) => row.employer && !NOT_AN_EMPLOYER.test(row.employer.trim()))
        .slice(0, 10)
        .map((row) => ({ employer: row.employer!, total: row.total }));
    }
    await upsert(
      ctx.db,
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
          coverage_end_date: typeof totals?.coverage_end_date === "string" ? totals.coverage_end_date.slice(0, 10) : null,
          source_name: "Federal Election Commission",
          source_url: `https://www.fec.gov/data/candidate/${p.fec_candidate_id}/?cycle=${cycle}`,
          updated_at: new Date().toISOString(),
        },
      ],
      "politician_id,cycle",
    );
    bump(ctx.log, "fec_summaries");

    if (!committeeId) continue;
    const gifts = (((await ctx.http.json(
      `${base}/schedules/schedule_a/?committee_id=${committeeId}&two_year_transaction_period=${cycle}&is_individual=true&sort=-contribution_receipt_amount&per_page=100&${key}`,
    )) as Json).results ?? []) as Record<string, unknown>[];
    const rows = gifts
      .filter((row) => row.sub_id && row.contributor_name)
      .map((row) => ({
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
    bump(ctx.log, "fec_contributions", await upsert(ctx.db, "tx_contributions", rows, "external_id"));
  }
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

/** Congress.gov's next-page link, with the key added back (its `next` links leave it out). */
export function nextPageUrl(body: { pagination?: { next?: string | null } }, key: string) {
  const next = body.pagination?.next;
  if (!next) return null;
  return /[?&]api_key=/.test(next) ? next : `${next}${next.includes("?") ? "&" : "?"}${key}`;
}

/** Every item in a Congress.gov list, following pagination.next until the last page. */
export async function allPages<T>(http: Http, firstUrl: string, field: string, key: string, maxPages = 100) {
  const items: T[] = [];
  let url: string | null = firstUrl;
  for (let page = 0; url && page < maxPages; page++) {
    const body = (await http.json(url)) as Record<string, unknown> & { pagination?: { next?: string | null; count?: number } };
    items.push(...((body[field] as T[] | undefined) ?? []));
    url = nextPageUrl(body, key);
  }
  if (url) throw new Error(`stopped after ${maxPages} pages of ${field}; the rest were not read`);
  return items;
}

export type CongressBill = {
  congress?: number;
  type?: string;
  number?: string;
  title?: string;
  introducedDate?: string;
  latestAction?: { actionDate?: string; text?: string } | null;
};

/**
 * One tx_record_actions row for a Congress.gov bill. These rows are upserted on every run, so
 * `title` and `result` (the latest action) follow the bill until it is enacted or dies. Fields a
 * person adds by hand (`promise_id`, `what_it_does`) are never sent, so they are kept.
 */
export function congressBillRow(politicianId: string, kind: "sponsored" | "cosponsored", bill: CongressBill) {
  if (!bill.congress || !bill.type || !bill.number || !bill.introducedDate) return null;
  const latest = bill.latestAction?.text ? `${bill.latestAction.text.trim()}${bill.latestAction.actionDate ? ` (${bill.latestAction.actionDate})` : ""}` : null;
  return {
    politician_id: politicianId,
    kind,
    bill_id: `${bill.type} ${bill.number}`,
    title: bill.title ?? `${bill.type} ${bill.number}`,
    acted_on: bill.introducedDate,
    result: latest,
    source_name: "Congress.gov",
    source_url: `https://www.congress.gov/bill/${ordinal(bill.congress)}-congress/${BILL_SLUGS[bill.type.toUpperCase()] ?? "senate-bill"}/${bill.number}`,
    external_id: `congress:${bill.congress}:${bill.type}:${bill.number}:${kind}`,
  };
}

export async function congress(ctx: Ctx, p: Politician) {
  const key = needKey(ctx);
  if (!p.bioguide_id) {
    ctx.log.notes.push(
      `Congress.gov: no bioguide_id is stored for ${p.name}. Congress.gov assigns one when the member is sworn in; add it to politicians.bioguide_id.`,
    );
    return;
  }
  for (const [path, field, kind] of [
    ["sponsored-legislation", "sponsoredLegislation", "sponsored"],
    ["cosponsored-legislation", "cosponsoredLegislation", "cosponsored"],
  ] as const) {
    const bills = await allPages<CongressBill>(
      ctx.http,
      `https://api.congress.gov/v3/member/${p.bioguide_id}/${path}?limit=250&format=json&${key}`,
      field,
      key,
    );
    const rows = bills.map((bill) => congressBillRow(p.id, kind, bill)).filter((row) => row !== null);
    if (rows.length < bills.length) ctx.log.notes.push(`Congress.gov: ${bills.length - rows.length} ${kind} bills had no number or introduced date and were skipped.`);
    bump(ctx.log, `congress_${kind}`, await upsert(ctx.db, "tx_record_actions", rows, "external_id"));
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
export const MAX_VOTES_PER_SYNC = 40;

export type SenateSession = { congress: number; session: 1 | 2 };

/**
 * The Senate sessions to read, oldest first: the previous session (so votes still waiting at the
 * turn of the year are finished first) and the current one. A session that ended before the
 * official took office is left out.
 */
export function senateSessions(today: Date, termStart: string): SenateSession[] {
  const year = today.getUTCFullYear();
  const congressNo = Math.floor((year - 1789) / 2) + 1;
  const current: SenateSession = { congress: congressNo, session: year % 2 === 1 ? 1 : 2 };
  const previous: SenateSession = current.session === 2 ? { congress: congressNo, session: 1 } : { congress: congressNo - 1, session: 2 };
  return Number(termStart.slice(0, 4)) <= year - 1 ? [previous, current] : [current];
}

/** Roll-call numbers in a session menu, as stored ("00256" stays "00256"). */
export function menuVotes(menu: string) {
  return allBlocks(menu, "vote")
    .map((block) => ({ number: tag(block, "vote_number"), title: tag(block, "title"), result: tag(block, "result") }))
    .filter((vote): vote is { number: string; title: string | null; result: string | null } => Boolean(vote.number));
}

/** The official's row for one roll call, found by lis_member_id. Null when they are not listed. */
export function senateVoteRow(xml: string, s: SenateSession, number: string, politicianId: string, lisId: string, menuTitle: string | null, menuResult: string | null) {
  const member = allBlocks(xml, "member").find((block) => tag(block, "lis_member_id") === lisId);
  if (!member) return null;
  const padded = number.padStart(5, "0");
  const folder = `vote${s.congress}${s.session}`;
  const cast = (tag(member, "vote_cast") ?? "").toLowerCase();
  const date = tag(xml, "vote_date");
  const parsed = date ? new Date(`${date.split(",").slice(0, 2).join(",")} UTC`) : null;
  return {
    politician_id: politicianId,
    kind: "vote",
    bill_id: tag(xml, "document_name") || null,
    title: tag(xml, "vote_title") || tag(xml, "question") || menuTitle || `Roll call ${number}`,
    what_it_does: tag(xml, "vote_question_text") || null,
    position: POSITIONS[cast] ?? null,
    result: tag(xml, "vote_result") || menuResult,
    // acted_on is required. A roll call always carries its date; the fallback only guards a malformed file.
    acted_on: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    source_name: "U.S. Senate roll call",
    source_url: `https://www.senate.gov/legislative/LIS/roll_call_votes/${folder}/vote_${s.congress}_${s.session}_${padded}.htm`,
    external_id: `senate:${s.congress}:${s.session}:${number}`,
  };
}

export async function senateVotes(ctx: Ctx, p: Politician) {
  if (!p.term_start || ctx.now < new Date(`${p.term_start}T00:00:00Z`)) {
    ctx.log.notes.push(`Senate votes: ${p.name} has not taken office yet.`);
    return;
  }
  if (!p.lis_member_id) {
    ctx.log.notes.push(`Senate votes: no lis_member_id is stored for ${p.name}. Add it from any roll call on senate.gov (the <lis_member_id> of the member).`);
    return;
  }
  const checkedSource = `senate_votes:${p.slug}`;
  const checked = await checkedItems(ctx.db, checkedSource);
  const rows: Record<string, unknown>[] = [];
  const notListed: string[] = [];
  let waiting = 0;
  for (const s of senateSessions(ctx.now, p.term_start)) {
    const menuRes = await ctx.http.text(`https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${s.congress}_${s.session}.xml`);
    if (!menuRes.ok) {
      if (menuRes.status === 404) {
        ctx.log.notes.push(`Senate votes: no roll calls published for the ${ordinal(s.congress)} Congress, session ${s.session}, yet.`);
        continue;
      }
      throw new Error(`${menuRes.status} from the ${s.congress}-${s.session} vote menu`);
    }
    const votes = menuVotes(menuRes.text);
    const ids = votes.map((v) => `senate:${s.congress}:${s.session}:${v.number}`);
    const stored = await knownIds(ctx.db, ids);
    const pending = votes.filter((_vote, i) => !stored.has(ids[i]) && !checked.has(ids[i])).sort((a, b) => Number(a.number) - Number(b.number));
    const room = MAX_VOTES_PER_SYNC - rows.length - notListed.length;
    waiting += Math.max(0, pending.length - room);
    for (const vote of pending.slice(0, Math.max(0, room))) {
      if (Date.now() > ctx.deadline) {
        waiting += 1;
        continue;
      }
      const padded = vote.number.padStart(5, "0");
      const xml = await ctx.http.text(`https://www.senate.gov/legislative/LIS/roll_call_votes/vote${s.congress}${s.session}/vote_${s.congress}_${s.session}_${padded}.xml`);
      if (!xml.ok) continue;
      const row = senateVoteRow(xml.text, s, vote.number, p.id, p.lis_member_id, vote.title, vote.result);
      if (row) rows.push(row);
      else notListed.push(`senate:${s.congress}:${s.session}:${vote.number}`);
    }
  }
  bump(ctx.log, "senate_votes", await upsert(ctx.db, "tx_record_actions", rows, "external_id"));
  await markChecked(ctx.db, checkedSource, notListed);
  // More roll calls wait: the run calls this source again while it has time.
  if (waiting > 0) ctx.log.notes.push(`Senate votes: ${waiting} roll calls were still waiting after this batch (${MAX_VOTES_PER_SYNC} per batch, oldest session first).`);
  return waiting > 0;
}
