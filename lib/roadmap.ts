export type Teaser = {
  id: "voting_record" | "donations";
  title: string;
  body: string;
  sources: string;
};

const VOTES: Record<string, string> = {
  "james-talarico": "Possible sources: Congress.gov and Senate roll calls.",
  "gina-hinojosa": "Possible sources: Texas bill signings and vetoes.",
};

const DONATIONS: Record<string, string> = {
  "james-talarico": "Possible source: FEC filings.",
  "gina-hinojosa": "Possible source: Texas Ethics Commission reports.",
};

export function teasersFor(slug?: string): Teaser[] {
  const votes =
    slug && VOTES[slug]
      ? VOTES[slug]
      : "Possible sources: Congress.gov and Senate roll calls for James Talarico. Texas bill signings and vetoes for Gina Hinojosa.";
  const donations =
    slug && DONATIONS[slug]
      ? DONATIONS[slug]
      : "Possible sources: FEC filings for James Talarico. Texas Ethics Commission reports for Gina Hinojosa.";

  return [
    {
      id: "voting_record",
      title: "Voting record",
      body: slug
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
    note: "No votes are stored. Do not invent votes, bill numbers, or outcomes.",
  },
  {
    id: "donations",
    status: "coming_soon",
    note: "No contributions are stored. Do not invent donors or amounts.",
  },
] as const;
