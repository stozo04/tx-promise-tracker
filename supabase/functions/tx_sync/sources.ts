// The one list of every source Sync knows about, per office. The run reads it to decide what to
// call, and the run notes read it to say what is not automated, so the two can never disagree.
import { campaignAppearances } from "./events_campaign.ts";
import { legalDates } from "./events_law.ts";
import { senateFloor, senateHearings } from "./events_senate.ts";
import { texasFloor, texasHearings } from "./events_texas.ts";
import { congress, fec, senateVotes } from "./federal.ts";
import { governorActions } from "./governor.ts";
import { senateJournal } from "./senate_journal.ts";
import type { Ctx, Politician } from "./shared.ts";
import { tec } from "./tec.ts";
import { houseJournal, tloBills } from "./texas.ts";

/** A source's run returns true when it has more to do, so the run calls it again while time is left. */
export type SourceRun = (ctx: Ctx, p: Politician) => Promise<boolean | void>;

export type SourceDef = {
  key: string;
  label: string;
  offices: string[];
  /** Null means the source is not automated yet; the run notes say so for each official it applies to. */
  run: SourceRun | null;
};

export const SOURCES: SourceDef[] = [
  { key: "fec", label: "the Federal Election Commission", offices: ["us_senate"], run: fec },
  { key: "congress", label: "Congress.gov", offices: ["us_senate"], run: congress },
  { key: "senate_votes", label: "U.S. Senate roll calls", offices: ["us_senate"], run: senateVotes },
  { key: "house_journal", label: "Texas House Journal record votes", offices: ["tx_house"], run: houseJournal },
  { key: "tlo_bills", label: "Texas Legislature Online authored and co-authored bills", offices: ["tx_house"], run: tloBills },
  { key: "governor", label: "Texas Legislature Online governor actions and Office of the Governor executive orders", offices: ["governor"], run: governorActions },
  { key: "senate_journal", label: "the Texas Senate Journal", offices: ["tx_lt_governor"], run: senateJournal },
  { key: "tec", label: "the Texas Ethics Commission", offices: ["governor", "tx_lt_governor", "tx_house"], run: tec },
  // Events (tx_upcoming_events). One source per kind of event.
  { key: "events_law", label: "dates set by law (statutes.capitol.texas.gov, senate.gov)", offices: ["us_senate", "governor", "tx_lt_governor", "tx_house"], run: legalDates },
  { key: "events_tx_floor", label: "Texas Legislature Online House and Senate floor calendars", offices: ["tx_house", "tx_lt_governor"], run: texasFloor },
  { key: "events_tx_hearings", label: "Texas Legislature Online committee meetings", offices: ["tx_house"], run: texasHearings },
  { key: "events_senate_floor", label: "the U.S. Senate floor schedule and tentative schedule", offices: ["us_senate"], run: senateFloor },
  { key: "events_senate_hearings", label: "U.S. Senate committee hearings", offices: ["us_senate"], run: senateHearings },
  { key: "events_campaign", label: "campaign events pages", offices: ["us_senate", "governor", "tx_lt_governor", "tx_house"], run: campaignAppearances },
];

export function sourcesFor(office: string, sources = SOURCES) {
  return sources.filter((source) => source.offices.includes(office));
}

/** One note per official listing the sources in the registry that have no run yet. */
export function notAutomatedNotes(politicians: Pick<Politician, "name" | "office">[], sources = SOURCES) {
  const notes: string[] = [];
  for (const p of politicians) {
    const missing = sourcesFor(p.office, sources).filter((source) => source.run === null);
    if (missing.length === 0) continue;
    const list = missing.map((source) => source.label);
    const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
    notes.push(`${p.name}: ${joined} ${list.length === 1 ? "is" : "are"} not automated yet. Their records are added by hand.`);
  }
  return notes;
}
