// The one list of every source Sync knows about, per office. The run reads it to decide what to
// call, and the run notes read it to say what is not automated, so the two can never disagree.
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
