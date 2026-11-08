import { officeMoneySources, officeRecordSources } from "@/lib/offices";

export type Teaser = {
  id: "voting_record" | "donations";
  title: string;
  body: string;
  sources: string;
};

/** Teasers for one office's page, or for the whole site when no office is given. */
export function teasersFor(office?: string): Teaser[] {
  const record = office ? officeRecordSources(office) : null;
  const money = office ? officeMoneySources(office) : null;
  const votes = record
    ? `Possible sources: ${record}.`
    : "Possible sources: Congress.gov and Senate roll calls for the U.S. Senate, Texas bill signings and vetoes for the governor, the Texas Senate Journal for the lieutenant governor, and Texas House record votes for state representatives.";
  const donations = money
    ? `Possible source: ${money}.`
    : "Possible sources: FEC filings for the U.S. Senate. Texas Ethics Commission reports for state offices.";

  return [
    {
      id: "voting_record",
      title: "Voting record",
      body: office
        ? "After the term starts, each vote can be shown next to the promise it actually relates to."
        : "See how each official votes once they are in office, linked to the promise it relates to.",
      sources: votes,
    },
    {
      id: "donations",
      title: "Donations",
      body: "Who contributed, shown only when a public filing is the proof.",
      sources: donations,
    },
  ];
}

export const NOT_YET_TRACKED = [
  {
    id: "voting_record",
    status: "coming_soon",
    note: "Votes and bills are on the For the nerds page, not in this API yet. Do not invent votes, bill numbers, or outcomes.",
  },
  {
    id: "donations",
    status: "coming_soon",
    note: "Contributions are on the For the nerds page, not in this API yet. Do not invent donors or amounts.",
  },
] as const;
