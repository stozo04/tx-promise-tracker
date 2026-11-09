// The Texas Senate Journal, for the lieutenant governor. The lieutenant governor presides over the
// Senate and is not a senator, so the journal lists them in a roll call only when they actually vote,
// which is rare (a tie, or the Committee of the Whole). In the journal the presiding officer appears
// in the Yeas or Nays list as "Mr. President" (or "Madam President"). Every journal day of the term
// is read once; a day with no such vote is remembered in tx_checked_items so it is not read again.
import { JOURNAL_API, parseJournalDays } from "./journal.ts";
import { bump, cellText, checkedItems, type Ctx, markChecked, ordinal, type Politician, texasLegislature, upsert } from "./shared.ts";

export type SenateRollCall = {
  /** Position of the roll call on the day page, so each one has a stable id. */
  index: number;
  sentence: string;
  bill: string | null;
  tally: { yea: number; nay: number; present: number };
  lists: Record<"yea" | "nay" | "present" | "absent", string[]>;
  /** True when the lists were not printed ("Same as previous roll call"). */
  same: boolean;
};

const LIST = /^(Yeas|Nays|Present-not voting|Absent-excused|Absent):\s*(.*?)\.?$/;
const KEYS: Record<string, keyof SenateRollCall["lists"]> = {
  Yeas: "yea",
  Nays: "nay",
  "Present-not voting": "present",
  "Absent-excused": "absent",
  Absent: "absent",
};
const BILL = /^(?:C?S?)?([HS](?:B|JR|CR|R))\s?(\d+)\b/;
export const PRESIDENT = /^(Mr\.|Madam|Madame|Ms\.)\s+President$/;

/** Every roll call on a Senate Journal day page, with its name lists. */
export function parseSenateRollCalls(dayHtml: string): SenateRollCall[] {
  const paragraphs = dayHtml
    .split(/<\/div>|<p\b/i)
    .map((chunk) => cellText(chunk.replace(/^[^>]*>/, "")).replace(/ /g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const calls: SenateRollCall[] = [];
  let bill: string | null = null;
  paragraphs.forEach((p, at) => {
    const heading = p.match(BILL);
    if (heading) bill = `${heading[1]} ${heading[2]}`;
    const tally = p.match(/by the following vote:\s*Yeas\s+(\d+),\s*Nays\s+(\d+)(?:,\s*Present-not voting\s+(\d+))?/i);
    if (!tally) return;
    const lists: SenateRollCall["lists"] = { yea: [], nay: [], present: [], absent: [] };
    for (let i = at + 1; i < Math.min(paragraphs.length, at + 6); i++) {
      const list = paragraphs[i].match(LIST);
      if (!list) break;
      lists[KEYS[list[1]]].push(...list[2].split(/,\s*/).map((name) => name.trim()).filter(Boolean));
    }
    calls.push({
      index: calls.length,
      sentence: p,
      bill,
      tally: { yea: Number(tally[1]), nay: Number(tally[2]), present: Number(tally[3] ?? 0) },
      lists,
      same: /Same as previous roll call/i.test(p),
    });
  });
  return calls;
}

/** How the presiding officer voted on a roll call, or null when they did not vote. */
export function presidingVote(call: SenateRollCall) {
  if (call.lists.yea.some((name) => PRESIDENT.test(name))) return "yea";
  if (call.lists.nay.some((name) => PRESIDENT.test(name))) return "nay";
  return null;
}

export const MAX_SENATE_DAYS_PER_CALL = 30;

export async function senateJournal(ctx: Ctx, p: Politician) {
  if (!p.term_start || ctx.now < new Date(`${p.term_start}T00:00:00Z`)) {
    ctx.log.notes.push(`Senate Journal: ${p.name} has not taken office yet.`);
    return false;
  }
  const legislature = texasLegislature(ctx.now);
  const days = parseJournalDays(await ctx.http.json(`${JOURNAL_API}/journals-for-legislature/${legislature}/S`).catch(() => []), "S").filter(
    (day) => day.date >= p.term_start!,
  );
  if (days.length === 0) {
    ctx.log.notes.push(`Senate Journal: no journal days published for the ${ordinal(legislature)} Legislature yet.`);
    return false;
  }
  const source = `senate_journal:${p.slug}`;
  const done = await checkedItems(ctx.db, source);
  const pending = days.filter((day) => !done.has(day.htmlUrl));
  let read = 0;
  for (const day of pending.slice(0, MAX_SENATE_DAYS_PER_CALL)) {
    if (Date.now() > ctx.deadline) break;
    const res = await ctx.http.text(day.htmlUrl, 60_000);
    if (!res.ok) throw new Error(`${res.status} from ${day.htmlUrl}`);
    const rows = parseSenateRollCalls(res.text).flatMap((call) => {
      const position = presidingVote(call);
      if (!position) return [];
      return [{
        politician_id: p.id,
        kind: "vote",
        bill_id: call.bill,
        title: call.bill ? `${call.bill} (${day.session})` : `Senate roll call (${day.session})`,
        what_it_does: `Vote cast by the presiding officer: ${call.sentence}`,
        position,
        result: call.sentence.match(/\b(passed|failed|prevailed|adopted|lost)\b/i)?.[1] ?? null,
        acted_on: day.date,
        source_name: "Texas Senate Journal",
        source_url: day.htmlUrl,
        external_id: `senate_journal:${day.fileName}:${call.index}:${p.slug}`,
      }];
    });
    bump(ctx.log, "senate_journal_votes", await upsert(ctx.db, "tx_record_actions", rows, "external_id", true));
    await markChecked(ctx.db, source, [day.htmlUrl]);
    read++;
  }
  bump(ctx.log, "senate_journal_days", read);
  return pending.length > read;
}
