// Texas Ethics Commission campaign finance for the state offices, from the TEC's daily bulk export
// (TEC_CF_CSV.zip). Files are read out of the zip with byte ranges (tec_zip.ts), never in full.
//
//   1. cover.csv holds each report's cover-sheet totals. Rows for the officials' filer IDs
//      (politicians.tec_filer_id) go into tx_tec_reports. Read again only when its CRC changes.
//   2. contribs_NN.csv files hold itemized contributions, roughly in the order reports arrived.
//      The first report ID of each file is noted (tx_tec_files) so only the files that hold an
//      official's reports are read. Each read file leaves per-report totals, in-state totals,
//      employers, and the largest gifts in tx_tec_report_parts. A file is read again only when
//      its CRC changes. Each call has 2 seconds of CPU, so a call reads at most one file and parses
//      at most TEC_ROWS_PER_CALL of its rows; a longer file goes on in the next call from where the
//      last one stopped, with the totals so far in the run's carry, and is saved once it is done.
//      Rows of other filers, non-receipt rows, and rows of replaced reports are dropped before
//      they are parsed.
//   3. When every needed file is read, the reports of each cycle are added up into
//      tx_contribution_summaries and the 100 largest individual gifts go into tx_contributions,
//      each linked to the TEC report it came from, the same way the FEC data is shown.
// Reports a later report replaced (infoOnlyFlag = Y) are left out.
import { fecCycles } from "./federal.ts";
import { bump, type Ctx, type Politician, upsert } from "./shared.ts";
import { csvFields, csvReader, entryText, grepLines, listZip, type ZipEntry } from "./tec_zip.ts";

const NOT_AN_EMPLOYER =
  /^(NOT[ -]?EMPLOYED|UNEMPLOYED|NONE|NULL|N\/?A|SELF[ -]?EMPLOYED|SELF|RETIRED|HOMEMAKER|STUDENT|INFORMATION REQUESTED.*|REQUESTED|BEST EFFORTS.*|-+)$/i;
const TOP_GIFTS = 100;
const TOP_EMPLOYERS_PER_PART = 300;

/** "20261029" to "2026-10-29". */
export function tecDate(value: string) {
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : null;
}

/** A report a reader can open: the TEC's scrubbed PDF, filed under the year it was received. */
export function tecReportUrl(reportId: string | number, receivedOn: string) {
  return `https://prd.tecprd.ethicsefile.com/public/cf/${receivedOn.slice(0, 4)}/pdfs/ScrubbedReport_${reportId}.PDF`;
}

export type TecReport = {
  report_id: number;
  filer_ident: string;
  report_type: string | null;
  received_on: string;
  period_start: string | null;
  period_end: string | null;
  total_contrib: number | null;
  unitemized_contrib: number | null;
  cash_on_hand: number | null;
  info_only: boolean;
};

const num = (value: string | undefined) => (value && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null);

/** A cover.csv row as a tx_tec_reports row. */
export function coverRow(row: Record<string, string>): TecReport | null {
  const received = tecDate(row.receivedDt);
  if (!row.reportInfoIdent || !received) return null;
  return {
    report_id: Number(row.reportInfoIdent),
    filer_ident: row.filerIdent,
    report_type: row.reportTypeCd1 || null,
    received_on: received,
    period_start: tecDate(row.periodStartDt),
    period_end: tecDate(row.periodEndDt),
    total_contrib: num(row.totalContribAmount),
    unitemized_contrib: num(row.unitemizedContribAmount),
    cash_on_hand: num(row.contribsMaintainedAmount),
    info_only: row.infoOnlyFlag === "Y",
  };
}

export type Gift = {
  id: string;
  report_id: number;
  name: string;
  city: string | null;
  state: string | null;
  employer: string | null;
  amount: number;
  date: string | null;
};

export type Part = {
  report_id: number;
  filer_ident: string;
  rows: number;
  itemized_total: number;
  in_state_total: number;
  employers: Record<string, number>;
  top_gifts: Gift[];
};

/** Adds contribution rows into per-report parts as they stream in, keeping only what is needed. */
export function partBuilder(from: Part[] = []) {
  const parts = new Map<string, Part>(from.map((part) => [`${part.filer_ident}:${part.report_id}`, part]));
  return {
    parts,
    add(row: Record<string, string>) {
      if (row.recordType !== "RCPT" || row.infoOnlyFlag === "Y") return;
      const amount = Number(row.contributionAmount);
      if (!Number.isFinite(amount)) return;
      const key = `${row.filerIdent}:${row.reportInfoIdent}`;
      let part = parts.get(key);
      if (!part) {
        part = { report_id: Number(row.reportInfoIdent), filer_ident: row.filerIdent, rows: 0, itemized_total: 0, in_state_total: 0, employers: {}, top_gifts: [] };
        parts.set(key, part);
      }
      part.rows++;
      part.itemized_total += amount;
      if (row.contributorStreetStateCd === "TX") part.in_state_total += amount;
      const individual = row.contributorPersentTypeCd === "INDIVIDUAL";
      const employer = row.contributorEmployer?.trim();
      if (individual && employer && !NOT_AN_EMPLOYER.test(employer)) {
        const name = employer.toUpperCase();
        part.employers[name] = (part.employers[name] ?? 0) + amount;
      }
      if (individual && (part.top_gifts.length < TOP_GIFTS || amount > part.top_gifts[part.top_gifts.length - 1].amount)) {
        const name = [row.contributorNameFirst, row.contributorNameLast].filter(Boolean).join(" ") || row.contributorNameOrganization;
        part.top_gifts.push({
          id: row.contributionInfoId,
          report_id: Number(row.reportInfoIdent),
          name,
          city: row.contributorStreetCity || null,
          state: row.contributorStreetStateCd || null,
          employer: employer || null,
          amount,
          date: tecDate(row.contributionDt),
        });
        part.top_gifts.sort((a, b) => b.amount - a.amount);
        if (part.top_gifts.length > TOP_GIFTS) part.top_gifts.length = TOP_GIFTS;
      }
    },
    /** Rows for tx_tec_report_parts, with employers cut to the largest ones. */
    rows(file: string) {
      return [...parts.values()].map((part) => ({
        file_name: file,
        report_id: part.report_id,
        filer_ident: part.filer_ident,
        rows: part.rows,
        itemized_total: Math.round(part.itemized_total * 100) / 100,
        in_state_total: Math.round(part.in_state_total * 100) / 100,
        employers: Object.fromEntries(Object.entries(part.employers).sort((a, b) => b[1] - a[1]).slice(0, TOP_EMPLOYERS_PER_PART)),
        top_gifts: part.top_gifts,
      }));
    },
  };
}

export const TEC_ROWS_PER_CALL = 50_000;

export function contribsFilter(header: string, filerIds: string[]) {
  const columns = csvFields(header);
  const type = columns.indexOf("recordType");
  const info = columns.indexOf("infoOnlyFlag");
  const filer = columns.indexOf("filerIdent");
  if (Math.min(type, info, filer) < 0) throw new Error("TEC contribs header has no recordType, infoOnlyFlag or filerIdent column");
  const wanted = new Set(filerIds);
  const fields = Math.max(type, info, filer) + 1;
  return (line: string) => {
    const values = csvFields(line, fields);
    return values[type] === "RCPT" && values[info] !== "Y" && wanted.has(values[filer]);
  };
}

export type ContribsCursor = { file: string; crc: string; done: number; parts: Part[] };

export async function readContribs(text: ReadableStream<string>, filerIds: string[], from: Pick<ContribsCursor, "done" | "parts"> | null, limit = TEC_ROWS_PER_CALL) {
  const builder = partBuilder(from?.parts);
  const skip = from?.done ?? 0;
  let keep: ((line: string) => boolean) | null = null;
  let read: ((line: string) => Record<string, string>) | null = null;
  let seen = 0;
  let finished = true;
  await grepLines(text, filerIds.map((id) => `,${id},`), (line, header) => {
    keep ??= contribsFilter(header, filerIds);
    if (!keep(line)) return false;
    const index = seen++;
    if (index < skip) return false;
    if (index >= skip + limit) {
      finished = false;
      return true;
    }
    read ??= csvReader(header);
    builder.add(read(line));
    return false;
  });
  return { builder, finished, done: skip + limit };
}

/** The TEC cycle a report belongs to: the even year at or after the end of its period. */
export function reportCycle(report: Pick<TecReport, "period_end" | "received_on">) {
  const year = Number((report.period_end ?? report.received_on).slice(0, 4));
  return year % 2 === 0 ? year : year + 1;
}

type PartRow = { report_id: number; itemized_total: number; in_state_total: number; employers: Record<string, number>; top_gifts: Gift[] };

/** One cycle's summary and its largest gifts, from the reports and the parts read from the files. */
export function summarize(politicianId: string, cycle: number, reports: TecReport[], parts: PartRow[]) {
  const inCycle = reports.filter((r) => !r.info_only && reportCycle(r) === cycle);
  if (inCycle.length === 0) return null;
  const ids = new Set(inCycle.map((r) => r.report_id));
  const used = parts.filter((p) => ids.has(Number(p.report_id)));
  const sum = (values: (number | null)[]) => Math.round(values.reduce<number>((total, v) => total + (v ?? 0), 0) * 100) / 100;
  const receipts = sum(inCycle.map((r) => r.total_contrib));
  const unitemized = sum(inCycle.map((r) => r.unitemized_contrib));
  const employers: Record<string, number> = {};
  for (const part of used) for (const [name, total] of Object.entries(part.employers)) employers[name] = (employers[name] ?? 0) + Number(total);
  const latest = [...inCycle].sort((a, b) => (b.period_end ?? b.received_on).localeCompare(a.period_end ?? a.received_on))[0];
  const gifts = used.flatMap((part) => part.top_gifts).sort((a, b) => b.amount - a.amount).slice(0, TOP_GIFTS);
  const byId = new Map(inCycle.map((r) => [r.report_id, r]));
  return {
    summary: {
      politician_id: politicianId,
      cycle,
      receipts,
      individual_unitemized: unitemized,
      individual_itemized: Math.round((receipts - unitemized) * 100) / 100,
      state_itemized_total: used.length ? sum(used.map((p) => Number(p.itemized_total))) : null,
      in_state_itemized: used.length ? sum(used.map((p) => Number(p.in_state_total))) : null,
      top_employers: Object.entries(employers)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([employer, total]) => ({ employer, total: Math.round(total * 100) / 100 })),
      coverage_end_date: latest.period_end,
      source_name: "Texas Ethics Commission",
      source_url: tecReportUrl(latest.report_id, latest.received_on),
      updated_at: new Date().toISOString(),
    },
    gifts: gifts.map((gift) => {
      const report = byId.get(gift.report_id)!;
      return {
        politician_id: politicianId,
        contributor_name: gift.name,
        contributor_city: gift.city,
        contributor_state: gift.state,
        contributor_employer: gift.employer,
        amount: gift.amount,
        contributed_on: gift.date,
        filing_id: String(gift.report_id),
        source_name: "Texas Ethics Commission",
        source_url: tecReportUrl(gift.report_id, report.received_on),
        external_id: `tec:${gift.id}`,
      };
    }),
  };
}

type FileRow = {
  name: string;
  crc: string;
  offset: number | null;
  compressed_size: number | null;
  size: number | null;
  method: number | null;
  first_received: string | null;
  read_crc: string | null;
  fetched_at: string | null;
};

async function fileRows(ctx: Ctx) {
  const { data, error } = await ctx.db.from("tx_tec_files").select("name, crc, offset, compressed_size, size, method, first_received, read_crc, fetched_at");
  if (error) throw new Error(`tx_tec_files: ${error.message}`);
  return new Map(((data ?? []) as FileRow[]).map((row) => [row.name, row]));
}

async function saveFiles(ctx: Ctx, rows: Partial<FileRow>[]) {
  if (rows.length === 0) return;
  const { error } = await ctx.db.from("tx_tec_files").upsert(rows.map((row) => ({ ...row, updated_at: new Date().toISOString() })), { onConflict: "name" });
  if (error) throw new Error(`tx_tec_files: ${error.message}`);
}

const entryOf = (row: FileRow): ZipEntry => ({
  name: row.name,
  crc: row.crc,
  offset: Number(row.offset),
  compressedSize: Number(row.compressed_size),
  size: Number(row.size),
  method: Number(row.method),
});

/**
 * The contribs files that can hold a report received on `receivedOn`. Files run in the order
 * reports arrived, so the report's rows are in the last file that starts before that day, plus any
 * files that start on that day.
 */
export function filesForReport(files: { name: string; first: string }[], receivedOn: string) {
  const sorted = [...files].sort((a, b) => Number(a.name.match(/\d+/)![0]) - Number(b.name.match(/\d+/)![0]));
  const before = sorted.filter((f) => f.first < receivedOn).at(-1);
  return [...(before ? [before.name] : []), ...sorted.filter((f) => f.first === receivedOn).map((f) => f.name)];
}

/**
 * Requests to the TEC per run. Its CDN refuses byte ranges (403) after a burst of requests, so a
 * run stays well under that and spaces requests out; a backfill continues over the next runs.
 */
export const MAX_TEC_REQUESTS_PER_RUN = 15;
const TEC_REQUEST_GAP_MS = 4_000;

const pause = () => new Promise((resolve) => setTimeout(resolve, TEC_REQUEST_GAP_MS));

type TecCarry = { batchRequests: number; cursor: ContribsCursor | null };

export async function tec(ctx: Ctx, p: Politician) {
  if (!p.tec_filer_id) {
    ctx.log.notes.push(`Texas Ethics Commission: no tec_filer_id is stored for ${p.name}. Add it from the TEC filer search.`);
    return false;
  }
  const { data: filers } = await ctx.db.from("politicians").select("id, tec_filer_id").not("tec_filer_id", "is", null);
  const people = (filers ?? []) as { id: string; tec_filer_id: string }[];
  const needles = people.map((row) => `,${row.tec_filer_id},`);
  const carry = (ctx.carry.tec ??= { batchRequests: 0, cursor: null }) as TecCarry;
  let state = await fileRows(ctx);
  let used = [...state.values()].filter((row) => row.fetched_at && row.fetched_at >= ctx.runStartedAt).length + carry.batchRequests;
  const budgetLeft = () => used < MAX_TEC_REQUESTS_PER_RUN;
  const spent = async (rows: Partial<FileRow>[]) => {
    used++;
    await saveFiles(ctx, rows.map((row) => ({ ...row, fetched_at: new Date().toISOString() })));
  };

  // 0. The zip's directory: read once per run (one HEAD and one range), kept in tx_tec_files.
  const meta = state.get("_zip");
  let zipUrl = meta?.read_crc ?? "";
  if (!meta?.fetched_at || meta.fetched_at < ctx.runStartedAt) {
    const zip = await listZip();
    await saveFiles(ctx, zip.entries.map((e) => {
      const old = state.get(e.name);
      const same = old?.crc === e.crc;
      return { name: e.name, crc: e.crc, offset: e.offset, compressed_size: e.compressedSize, size: e.size, method: e.method, first_received: same ? old.first_received : null, read_crc: old?.read_crc ?? null };
    }));
    await spent([{ name: "_zip", crc: zip.lastModified, read_crc: zip.url }]);
    zipUrl = zip.url;
    state = await fileRows(ctx);
  }

  // 1. Cover sheets, when the cover changed.
  const cover = state.get("cover.csv");
  if (!cover) throw new Error("cover.csv is not in the TEC zip");
  if (cover.read_crc !== cover.crc) {
    if (!budgetLeft()) return waitNote(ctx, p);
    await pause();
    const rows: TecReport[] = [];
    let read: ((line: string) => Record<string, string>) | null = null;
    await grepLines(await entryText(zipUrl, entryOf(cover)), needles, (line, header) => {
      read ??= csvReader(header);
      const row = coverRow(read(line));
      if (row && needles.includes(`,${row.filer_ident},`)) rows.push(row);
    });
    const byFiler = new Map(people.map((row) => [row.tec_filer_id, row.id]));
    await upsert(ctx.db, "tx_tec_reports", rows.map((row) => ({ ...row, politician_id: byFiler.get(row.filer_ident), updated_at: new Date().toISOString() })), "report_id");
    await spent([{ name: "cover.csv", crc: cover.crc, read_crc: cover.crc }]);
    bump(ctx.log, "tec_reports", rows.length);
    return true; // The cover took this call's CPU; the files come next call.
  }

  // 2. Which contribs files hold this official's reports, by the day each report was received.
  const cycles = fecCycles(p.election_date, ctx.now);
  const { data: reportData, error: reportError } = await ctx.db
    .from("tx_tec_reports")
    .select("report_id, filer_ident, report_type, received_on, period_start, period_end, total_contrib, unitemized_contrib, cash_on_hand, info_only")
    .eq("filer_ident", p.tec_filer_id);
  if (reportError) throw new Error(`tx_tec_reports: ${reportError.message}`);
  const reports = ((reportData ?? []) as TecReport[]).map((r) => ({ ...r, report_id: Number(r.report_id) }));
  const wanted = reports.filter((r) => !r.info_only && cycles.includes(reportCycle(r)) && (r.total_contrib ?? 0) > (r.unitemized_contrib ?? 0));

  const order = [...state.values()].filter((row) => /^contribs_\d+\.csv$/.test(row.name)).sort((a, b) => Number(a.name.match(/\d+/)![0]) - Number(b.name.match(/\d+/)![0]));
  const firstOf = async (row: FileRow) => {
    if (row.first_received) return row.first_received;
    if (!budgetLeft()) return null;
    await pause();
    let first: string | null = null;
    await grepLines(await entryText(zipUrl, entryOf(row), 32_768), [], (line, header) => {
      first = tecDate(csvReader(header)(line).receivedDt);
    }, true).catch(() => {});
    if (!first) throw new Error(`could not read the first row of ${row.name}`);
    row.first_received = first;
    await spent([{ name: row.name, crc: row.crc, first_received: first }]);
    return first as string;
  };
  const needed = new Set<string>();
  for (const report of wanted) {
    // Binary search for the last file that starts on or before the day the report was received.
    let lo = 0;
    let hi = order.length - 1;
    let last = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const first = await firstOf(order[mid]);
      if (first === null) return waitNote(ctx, p);
      if (first <= report.received_on) (last = mid), (lo = mid + 1);
      else hi = mid - 1;
    }
    // That file, any earlier files that start on the same day, and the one before them.
    for (let i = last; i >= 0; i--) {
      const first = await firstOf(order[i]);
      if (first === null) return waitNote(ctx, p);
      needed.add(order[i].name);
      if (first < report.received_on) break;
    }
  }

  // 3. Read one file that is new or changed, or the next rows of the one an earlier call stopped in.
  const next = order.find((row) => needed.has(row.name) && row.read_crc !== row.crc);
  if (next) {
    if (!budgetLeft()) return waitNote(ctx, p);
    const resume = carry.cursor?.file === next.name && carry.cursor.crc === next.crc ? carry.cursor : null;
    await pause();
    const batch = await readContribs(await entryText(zipUrl, entryOf(next)), people.map((row) => row.tec_filer_id), resume);
    if (resume) carry.batchRequests++;
    if (!batch.finished) {
      carry.cursor = { file: next.name, crc: next.crc, done: batch.done, parts: [...batch.builder.parts.values()] };
      if (!resume) await spent([{ name: next.name, crc: next.crc }]);
      bump(ctx.log, "tec_batches_read");
      return true;
    }
    if (resume) carry.cursor = null;
    const { error: deleteError } = await ctx.db.from("tx_tec_report_parts").delete().eq("file_name", next.name);
    if (deleteError) throw new Error(`tx_tec_report_parts: ${deleteError.message}`);
    await upsert(ctx.db, "tx_tec_report_parts", batch.builder.rows(next.name), "file_name,report_id,filer_ident");
    await spent([{ name: next.name, crc: next.crc, read_crc: next.crc }]);
    bump(ctx.log, "tec_files_read");
    return true;
  }

  // 4. Every needed file is read: write the summaries and the largest gifts.
  const { data: partData, error: partError } = await ctx.db
    .from("tx_tec_report_parts")
    .select("report_id, itemized_total, in_state_total, employers, top_gifts")
    .eq("filer_ident", p.tec_filer_id);
  if (partError) throw new Error(`tx_tec_report_parts: ${partError.message}`);
  for (const cycle of cycles) {
    const result = summarize(p.id, cycle, reports, (partData ?? []) as PartRow[]);
    if (!result) continue;
    await upsert(ctx.db, "tx_contribution_summaries", [result.summary], "politician_id,cycle");
    bump(ctx.log, "tec_summaries");
    bump(ctx.log, "tec_contributions", await upsert(ctx.db, "tx_contributions", result.gifts, "external_id"));
  }
  return false;
}

function waitNote(ctx: Ctx, p: Politician) {
  ctx.log.notes.push(`Texas Ethics Commission: ${p.name}'s reports wait for the next run (${MAX_TEC_REQUESTS_PER_RUN} requests per run to the TEC).`);
  return false;
}
