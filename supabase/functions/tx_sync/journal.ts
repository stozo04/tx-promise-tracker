// Texas House Journal parsing: record votes on a journal day page, and the office a member held.
// The journal web service (salsajournalwebservices.legis.texas.gov) lists every journal day of a
// legislature; each day is an HTML page on journals.house.texas.gov.
import { cellText, decodeEntities, ordinal } from "./shared.ts";

export const JOURNAL_API = "https://salsajournalwebservices.legis.texas.gov/api/v1/JournalWebSite";

export type JournalDay = { session: string; date: string; htmlUrl: string; fileName: string };

/** Every journal day in a legislature, oldest first. `chamber` is "H" or "S". */
export function parseJournalDays(body: unknown, chamber: "H" | "S"): JournalDay[] {
  const host = chamber === "H" ? "https://journals.house.texas.gov" : "https://journals.senate.texas.gov";
  const sessions = (Array.isArray(body) ? body : []) as {
    legislature: string;
    session: string;
    legislativeDates?: { legislativeDate: string; legislativeDays?: { fileName: string; htmlPath?: string | null }[] }[];
  }[];
  const days: JournalDay[] = [];
  for (const s of sessions) {
    for (const date of s.legislativeDates ?? []) {
      for (const day of date.legislativeDays ?? []) {
        if (!day.htmlPath) continue;
        days.push({ session: `${s.legislature}${s.session}`, date: date.legislativeDate.slice(0, 10), htmlUrl: `${host}${day.htmlPath}`, fileName: day.fileName });
      }
    }
  }
  return days.sort((a, b) => a.date.localeCompare(b.date) || a.fileName.localeCompare(b.fileName));
}

/** The HTML day page for a House Journal PDF link. */
export function houseJournalHtml(pdfHref: string) {
  const match = pdfHref.match(/journals\.house\.texas\.gov\/hjrnl\/([^/]+)\/pdf\/([^#?]+)\.pdf/i);
  if (!match) return null;
  return `https://journals.house.texas.gov/HJRNL/${match[1].toUpperCase()}/HTML/${match[2].toUpperCase()}.HTM`;
}

export type RecordVote = {
  record: string;
  question: string;
  result: string | null;
  /** The bill the vote was on ("HB 12"), from the heading above it. Null for votes on motions or rules. */
  bill: string | null;
  lists: Record<string, string[]>;
};

const LIST_LABELS: [RegExp, "yea" | "nay" | "present" | "absent"][] = [
  [/^Yeas\b/, "yea"],
  [/^Nays\b/, "nay"],
  [/^Present, not voting\b/, "present"],
  [/^Absent\b/, "absent"],
];
const HEADING = /^(C?S?)([HS][BJRC]R?)\s?(\d+)\b.*\b(READING|AMENDMENTS?|REPORT|CALENDAR)\b/;

function dayParagraphs(dayHtml: string) {
  return dayHtml
    .split(/<\/div>/i)
    .map((chunk) => cellText(chunk))
    .filter(Boolean);
}

function readVote(paragraphs: string[], at: number, record: string): RecordVote {
  const sentence = paragraphs[at];
  const clause = sentence.split(new RegExp(`\\s*\\(Record ${record}\\)`))[0].replace(/\s+by$/, "").trim();
  // Context: the bill heading ("HB 1181 ON THIRD READING"). Who offered an amendment is not
  // guessed: the nearest "offered the following amendment" line can belong to a different one.
  let heading = "";
  for (let i = at - 1; i >= Math.max(0, at - 400); i--) {
    if (HEADING.test(paragraphs[i])) {
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
  const billMatch = heading.match(HEADING);
  return { record, question, result, bill: billMatch ? `${billMatch[2]} ${billMatch[3]}` : null, lists };
}

/** Find "(Record N)" in a House Journal day page and read who voted which way. */
export function parseRecordVote(dayHtml: string, record: string): RecordVote | null {
  const paragraphs = dayParagraphs(dayHtml);
  const at = paragraphs.findIndex((p) => new RegExp(`\\(Record ${record}\\)`).test(p));
  return at === -1 ? null : readVote(paragraphs, at, record);
}

/** Every record vote on a House Journal day page, in order. */
export function recordVotesInDay(dayHtml: string): RecordVote[] {
  const paragraphs = dayParagraphs(dayHtml);
  const votes: RecordVote[] = [];
  const seen = new Set<string>();
  paragraphs.forEach((p, at) => {
    for (const match of p.matchAll(/\(Record (\d+)\)/g)) {
      if (seen.has(match[1])) continue;
      // Only the paragraph that is followed by the Yeas/Nays lists records the vote itself.
      if (!LIST_LABELS.some(([re]) => re.test(paragraphs[at + 1] ?? ""))) continue;
      seen.add(match[1]);
      votes.push(readVote(paragraphs, at, match[1]));
    }
  });
  return votes;
}

/** How a member voted, by the exact name the journal uses for them that legislature. */
export function positionOf(vote: RecordVote, journalName: string) {
  return (Object.entries(vote.lists).find(([, names]) => names.includes(journalName)) ?? [])[0] ?? null;
}

/** "Texas House, District 47 (88th Legislature)" or "... (89th Legislature, 2nd called session)". */
export function officeContext(district: string, session: string, chamber = "House") {
  const legislature = parseInt(session.slice(0, 2), 10);
  const special = session.slice(2);
  const called = /^\d$/.test(special) ? `, ${ordinal(Number(special))} called session` : "";
  return `Texas ${chamber}, District ${district} (${ordinal(legislature)} Legislature${called})`;
}

export { decodeEntities };
