// Dates the law sets: when the Texas Legislature convenes, the 60th and 140th days of a regular
// session, the governor's veto period, and the day each term begins. Each date is computed only from
// the rule in the law's own text, which this source reads from the official site on every run
// (statutes.capitol.texas.gov's file server and senate.gov). If the sentence the rule comes from is
// not found word for word, the date is not loaded and the run says why. Every row carries the
// citation (`legal_basis`), a link to the text (`legal_url`), and what it was computed from.
import { addDays, type EventDraft, eventsFrom, forOfficial, saveEvents, zonedTime } from "./events.ts";
import { cellText, type Ctx, ordinal, type Politician } from "./shared.ts";

/** The law texts, as the official sites serve them, and the sentence each rule depends on. */
export const LAWS = {
  convene: {
    citation: "Tex. Gov't Code §301.001",
    fetch: "https://tcss.legis.texas.gov/resources/GV/htm/GV.301.htm",
    link: "https://statutes.capitol.texas.gov/Docs/GV/htm/GV.301.htm#301.001",
    rule: /The legislature shall convene at the seat of government in regular session at 12 noon on the second Tuesday in January of each odd-numbered year\./,
  },
  filing: {
    citation: "Tex. Const. art. 3, §5(b)",
    fetch: "https://tcss.legis.texas.gov/resources/CN/htm/CN.3.htm",
    link: "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.3.htm#3.5",
    rule: /the first thirty days thereof shall be devoted to the introduction of bills and resolutions[\s\S]*?During the succeeding thirty days of the regular session[\s\S]*?During the remainder of the session the Legislature shall act upon such bills and resolutions as may be then pending/,
  },
  length: {
    citation: "Tex. Const. art. 3, §24(b)",
    fetch: "https://tcss.legis.texas.gov/resources/CN/htm/CN.3.htm",
    link: "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.3.htm#3.24",
    rule: /No Regular Session shall be of longer duration than one hundred and forty \(140\) days\./,
  },
  veto: {
    citation: "Tex. Const. art. 4, §14",
    fetch: "https://tcss.legis.texas.gov/resources/CN/htm/CN.4.htm",
    link: "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.4.htm#4.14",
    rule: /unless he shall file the same, with his objections, in the office of the Secretary of State and give notice thereof by public proclamation within twenty days after such adjournment/,
  },
  installed: {
    citation: "Tex. Const. art. 4, §4",
    fetch: "https://tcss.legis.texas.gov/resources/CN/htm/CN.4.htm",
    link: "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.4.htm#4.4",
    rule: /shall be installed on the first Tuesday after the organization of the Legislature, or as soon thereafter as practicable, and shall hold his office for the term of four years/,
  },
  ltGovernor: {
    citation: "Tex. Const. art. 4, §16(a)",
    fetch: "https://tcss.legis.texas.gov/resources/CN/htm/CN.4.htm",
    link: "https://statutes.capitol.texas.gov/Docs/CN/htm/CN.4.htm#4.16",
    rule: /There shall also be a Lieutenant Governor, who shall be chosen at every election for Governor by the same voters, in the same manner, continue in office for the same time/,
  },
  senateTerm: {
    citation: "U.S. Const. amend. XX, §1",
    fetch: "https://www.senate.gov/about/origins-foundations/senate-and-constitution/constitution.htm",
    link: "https://www.senate.gov/about/origins-foundations/senate-and-constitution/constitution.htm",
    rule: /the terms of Senators and Representatives at noon on the 3d day of January, of the years in which such terms would have ended if this article had not been ratified; and the terms of their successors shall then begin/,
  },
} as const;

export type LawKey = keyof typeof LAWS;

/** Which laws each office's dates depend on. */
export const LAWS_FOR: Record<string, LawKey[]> = {
  tx_house: ["convene", "filing", "length"],
  tx_lt_governor: ["convene", "filing", "length", "installed", "ltGovernor"],
  governor: ["convene", "length", "veto", "installed"],
  us_senate: ["senateTerm"],
};

/** The law text on one line, as cellText reads it. */
export function lawText(html: string) {
  return cellText(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " "));
}

/** The laws whose rule sentence is in the fetched text. */
export function verifiedLaws(texts: Partial<Record<LawKey, string>>) {
  return new Set((Object.keys(LAWS) as LawKey[]).filter((key) => texts[key] !== undefined && LAWS[key].rule.test(texts[key]!)));
}

/** Second Tuesday in January of a year. */
export function secondTuesdayOfJanuary(year: number) {
  const first = new Date(Date.UTC(year, 0, 1)).getUTCDay(); // 0 = Sunday
  const firstTuesday = 1 + ((2 - first + 7) % 7);
  return `${year}-01-${String(firstTuesday + 7).padStart(2, "0")}`;
}

/** The nth day of a session counting the convening day as day 1. */
export function sessionDay(convened: string, n: number) {
  return addDays(convened, n - 1);
}

/** The regular session whose dates are upcoming on `today`: the one in progress, or the next one. */
export function regularSession(today: string) {
  let year = Number(today.slice(0, 4));
  if (year % 2 === 0) year += 1;
  for (;;) {
    const convened = secondTuesdayOfJanuary(year);
    // Still upcoming while the governor's veto period after the 140th day has not ended.
    if (addDays(sessionDay(convened, 140), 20) >= today) return { year, legislature: 90 + (year - 2027) / 2, convened };
    year += 2;
  }
}

const LEGISLATURE = (n: number) => `${ordinal(n)} Legislature`;

/** The events the law sets for one office, for the session upcoming on `today`. */
export function legalEvents(office: string, today: string, verified: Set<LawKey>, termStart: string | null): EventDraft[] {
  const drafts: EventDraft[] = [];
  const law = (key: LawKey) => ({ legal_basis: LAWS[key].citation, legal_url: LAWS[key].link, source_name: "Texas Constitution and Statutes", source_url: LAWS[key].link });

  if (office === "us_senate") {
    if (!verified.has("senateTerm") || !termStart) return drafts;
    // Senate terms run six years from noon on January 3 of an odd year; the term start stored for the
    // official is that day.
    if (!termStart.endsWith("-01-03")) return drafts;
    drafts.push({
      ...law("senateTerm"),
      source_name: "U.S. Senate: the Constitution",
      kind: "deadline",
      title: "U.S. Senate term begins at noon Eastern",
      starts_on: termStart,
      starts_at: zonedTime(termStart, "12:00", "America/New_York"),
      body: "U.S. Senate",
      details: "The Twentieth Amendment ends Senate terms, and begins the next ones, at noon on January 3. 12:00 p.m. Eastern is 11:00 a.m. Central.",
      computed_from: `Noon on January 3, the day the Twentieth Amendment sets, in the year the term begins (${termStart.slice(0, 4)}).`,
      event_key: `law:us_senate:term:${termStart}`,
    });
    return drafts;
  }

  if (!verified.has("convene")) return drafts;
  const session = regularSession(today);
  const name = `${LEGISLATURE(session.legislature)}, Regular Session`;
  const code = `${session.legislature}R`;
  const conveningRule = `${session.convened} is the second Tuesday in January ${session.year}, when ${LAWS.convene.citation} convenes the Legislature.`;

  if (office === "tx_house" || office === "tx_lt_governor") {
    // One event for both chambers: the representative's and the lieutenant governor's rows share it.
    const chamber = "Texas Legislature";
    drafts.push({
      ...law("convene"),
      kind: "session_day",
      title: `${LEGISLATURE(session.legislature)} convenes at noon`,
      starts_on: session.convened,
      starts_at: zonedTime(session.convened, "12:00", "America/Chicago"),
      location: "Texas State Capitol, Austin",
      body: chamber,
      details: `The first day of the ${name}. The law sets 12 noon on the second Tuesday in January of each odd-numbered year.`,
      computed_from: conveningRule,
      event_key: `law:${code}:convene`,
    });
    if (verified.has("filing")) {
      drafts.push({
        ...law("filing"),
        kind: "deadline",
        title: "60th day: last day for unrestricted bill filing",
        starts_on: sessionDay(session.convened, 60),
        body: chamber,
        details:
          "The Constitution gives the first 30 days of a regular session to introducing bills and the next 30 days to committee hearings. During the rest of the session the Legislature acts on the bills then pending. Either house may change its order of business by a four-fifths vote (§5(c)).",
        computed_from: `The 60th day counting ${session.convened}, the day the ${LEGISLATURE(session.legislature)} convenes (${LAWS.convene.citation}), as day 1.`,
        event_key: `law:${code}:day60`,
      });
    }
    if (verified.has("length")) {
      drafts.push({
        ...law("length"),
        kind: "session_day",
        title: "140th day: last day the regular session may run",
        starts_on: sessionDay(session.convened, 140),
        body: chamber,
        details: "A regular session may not last longer than 140 days.",
        computed_from: `The 140th day counting ${session.convened}, the day the ${LEGISLATURE(session.legislature)} convenes (${LAWS.convene.citation}), as day 1.`,
        event_key: `law:${code}:day140`,
      });
    }
  }

  if ((office === "governor" || office === "tx_lt_governor") && verified.has("installed") && (office === "governor" || verified.has("ltGovernor"))) {
    // The Legislature organizes on the day it convenes; the governor is installed the first Tuesday after.
    const installed = addDays(session.convened, 7);
    // Only the installation that starts the official's own term.
    if (termStart === installed) {
      const lt = office === "tx_lt_governor";
      drafts.push({
        ...law("installed"),
        legal_basis: lt ? `${LAWS.installed.citation}; ${LAWS.ltGovernor.citation}` : LAWS.installed.citation,
        kind: "deadline",
        title: lt ? "Lieutenant governor's term begins" : "Governor's installation",
        starts_on: installed,
        location: "Texas State Capitol, Austin",
        body: lt ? "Lieutenant Governor of Texas" : "Governor of Texas",
        details: lt
          ? "The lieutenant governor continues in office for the same time as the governor, who is installed on the first Tuesday after the organization of the Legislature, or as soon thereafter as practicable."
          : "The governor is installed on the first Tuesday after the organization of the Legislature, or as soon thereafter as practicable.",
        computed_from: `The first Tuesday after ${session.convened}, the day the ${LEGISLATURE(session.legislature)} convenes and organizes (${LAWS.convene.citation}).`,
        event_key: `law:${code}:installed:${lt ? "lt_governor" : "governor"}`,
      });
    }
  }

  if (office === "governor" && verified.has("veto") && verified.has("length")) {
    const lastDay = sessionDay(session.convened, 140);
    drafts.push({
      ...law("veto"),
      legal_basis: `${LAWS.veto.citation}; ${LAWS.length.citation}`,
      kind: "deadline",
      title: "Last day for the governor to veto bills after the session ends",
      starts_on: addDays(lastDay, 20),
      body: "Governor of Texas",
      details:
        "When the Legislature's adjournment prevents the return of a bill, the governor has 20 days after adjournment to file a veto with the Secretary of State; otherwise the bill becomes law. This date counts 20 days from the 140th day, the last day the session may run. If the Legislature adjourns earlier, the period ends earlier.",
      computed_from: `20 days after ${lastDay}, the 140th day of the ${name} (${LAWS.length.citation}).`,
      event_key: `law:${code}:veto_period`,
    });
  }
  return drafts;
}

/** Sync source: dates the law sets, for one official. */
export async function legalDates(ctx: Ctx, p: Politician) {
  const keys = LAWS_FOR[p.office] ?? [];
  if (keys.length === 0) return;
  const texts: Partial<Record<LawKey, string>> = {};
  const byUrl = new Map<string, string>();
  for (const key of keys) {
    const url = LAWS[key].fetch;
    if (!byUrl.has(url)) {
      const res = await ctx.http.text(url, 30_000);
      if (!res.ok) throw new Error(`${res.status} from ${url}`);
      byUrl.set(url, lawText(res.text));
    }
    texts[key] = byUrl.get(url);
  }
  const verified = verifiedLaws(texts);
  for (const key of keys) {
    if (!verified.has(key)) ctx.log.notes.push(`Dates set by law: the text of ${LAWS[key].citation} no longer reads as expected at ${LAWS[key].link}, so the dates that depend on it were not loaded for ${p.name}.`);
  }
  const today = eventsFrom(ctx, { term_start: null });
  const rows = legalEvents(p.office, today, verified, p.term_start).map((draft) => forOfficial(draft, p));
  await saveEvents(ctx, p, "Dates set by law", "law:", rows, { from: today, complete: false });
}
