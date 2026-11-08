/**
 * Everything the site needs to know about an office, in one place.
 * A politician row's `office` picks the entry. A Texas House seat also needs `district`.
 */

type OfficeInfo = {
  /** Full name of the office, e.g. "Governor of Texas". */
  label: string;
  /** One word for the header switch when there is no district. */
  short: string;
  /** How copy refers to the person in the job: "the senator", "the governor". */
  role: string;
  /** Years in one term. */
  termYears: number;
  /** "chamber" offices vote on bills. The governor signs or vetoes them instead. */
  kind: "chamber" | "executive";
  /** What the upcoming tab will hold once it is loaded. */
  upcoming: string;
  /** Where votes or bill actions will come from. */
  recordSources: string;
  /** Where campaign money will come from. */
  moneySources: string;
  /** How far along loading the record is. */
  recordState: string;
  /** How far along loading campaign money is. */
  moneyState: string;
};

export const OFFICES: Record<string, OfficeInfo> = {
  us_senate: {
    label: "U.S. Senate",
    short: "Senator",
    role: "senator",
    termYears: 6,
    kind: "chamber",
    upcoming: "Upcoming Senate votes and committee hearings",
    recordSources: "Congress.gov and Senate roll calls",
    moneySources: "FEC filings",
    recordState: "Loaded by Sync once the term starts.",
    moneyState: "Loaded by Sync.",
  },
  governor: {
    label: "Governor of Texas",
    short: "Governor",
    role: "governor",
    termYears: 4,
    kind: "executive",
    upcoming: "Upcoming bill deadlines, special sessions, and signing dates",
    recordSources: "Texas bill signings and vetoes",
    moneySources: "Texas Ethics Commission reports",
    recordState: "Added by hand for now.",
    moneyState: "Not automated yet.",
  },
  tx_house: {
    label: "Texas House of Representatives",
    short: "State Rep",
    role: "representative",
    termYears: 2,
    kind: "chamber",
    upcoming: "Upcoming Texas House floor votes and committee hearings",
    recordSources: "Texas Legislature Online and Texas House record votes",
    moneySources: "Texas Ethics Commission reports",
    recordState: "Not automated yet.",
    moneyState: "Not automated yet.",
  },
};

type OfficeHolder = { office: string; district?: string | null };

function info(office: string): OfficeInfo | undefined {
  return OFFICES[office];
}

function humanize(value: string) {
  const text = value.replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : value;
}

/** "Texas House of Representatives, District 112", or just the office name. */
export function officeTitle(person: OfficeHolder) {
  const label = info(person.office)?.label ?? humanize(person.office);
  return person.district ? `${label}, District ${person.district}` : label;
}

/** The header switch label: "Senator", "Governor", "District 112". */
export function officeShort(person: OfficeHolder & { name: string }) {
  if (person.district) return `District ${person.district}`;
  return info(person.office)?.short ?? person.name.split(" ")[0];
}

export function officeRole(office: string) {
  return info(office)?.role ?? "official";
}

export function officeTermYears(office: string) {
  return info(office)?.termYears ?? 4;
}

export function isExecutive(office: string) {
  return info(office)?.kind === "executive";
}

export function officeUpcoming(office: string) {
  return info(office)?.upcoming ?? "Upcoming events";
}

export function officeRecordSources(office: string) {
  return info(office)?.recordSources ?? null;
}

export function officeMoneySources(office: string) {
  return info(office)?.moneySources ?? null;
}

/** "Congress.gov and Senate roll calls. Loaded by Sync once the term starts." */
export function officeRecordPlan(office: string) {
  const entry = info(office);
  return entry ? `${entry.recordSources}. ${entry.recordState}` : "Sources not chosen yet.";
}

export function officeMoneyPlan(office: string) {
  const entry = info(office);
  return entry ? `${entry.moneySources}. ${entry.moneyState}` : "Sources not chosen yet.";
}
