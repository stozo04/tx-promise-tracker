export type DataSource = {
  name: string;
  who: string;
  what: string;
  how: string;
  why: string;
  href: string;
  linkText: string;
  /** "live" sources feed the ledger today. "planned" sources are on the roadmap and load nothing yet. */
  state: "live" | "planned";
  /** Limit a planned source to one office. Empty means it applies to both. */
  offices?: string[];
};

export const DATA_SOURCES: DataSource[] = [
  {
    name: "Campaign websites",
    who: "Each campaign's own site",
    what: "The issue pages where each promise was published, quoted word for word",
    how: "Pages are opened in a real browser, saved as HTML, and screenshotted",
    why: "It is the campaign's own wording, captured before it can be edited",
    href: "/archives",
    linkText: "See the saved pages",
    state: "live",
  },
  {
    name: "Posts on X",
    who: "The candidates' own accounts",
    what: "Promises made in posts, with the post date",
    how: "Each post is saved with its link and date",
    why: "It is the candidate speaking directly, on a dated public post",
    href: "https://x.com",
    linkText: "x.com",
    state: "live",
  },
  {
    name: "Internet Archive",
    who: "Independent nonprofit library",
    what: "A time-stamped copy of every campaign page we quote",
    how: "Each page is sent to the Wayback Machine when it is captured",
    why: "Anyone can open the copy, and it cannot be changed after it is saved",
    href: "https://web.archive.org",
    linkText: "web.archive.org",
    state: "live",
  },
  {
    name: "Texas Legislature Online",
    who: "Texas Legislative Council (state agency)",
    what: "Bills, their history, and whether the governor signed or vetoed them",
    how: "Official bill records, checked on each sync",
    why: "It is the Legislature's own record of every bill",
    href: "https://capitol.texas.gov",
    linkText: "capitol.texas.gov",
    state: "planned",
    offices: ["governor"],
  },
  {
    name: "Office of the Governor",
    who: "State of Texas",
    what: "Executive orders, proclamations, and veto statements",
    how: "Official documents, checked on each sync",
    why: "Published by the governor's office itself",
    href: "https://gov.texas.gov",
    linkText: "gov.texas.gov",
    state: "planned",
    offices: ["governor"],
  },
  {
    name: "Congress.gov",
    who: "Library of Congress",
    what: "Bills the senator sponsored or co-sponsored, and every action on them",
    how: "The official Congress.gov API",
    why: "It is the official record of Congress",
    href: "https://www.congress.gov",
    linkText: "congress.gov",
    state: "live",
    offices: ["us_senate"],
  },
  {
    name: "U.S. Senate roll call votes",
    who: "Secretary of the Senate",
    what: "How the senator voted on each recorded vote",
    how: "Vote data the Senate publishes after each roll call",
    why: "The Senate clerk records each vote as it happens",
    href: "https://www.senate.gov",
    linkText: "senate.gov",
    state: "live",
    offices: ["us_senate"],
  },
  {
    name: "Federal Election Commission",
    who: "Independent federal agency",
    what: "Who gave to the senator's campaign, and how much",
    how: "The official OpenFEC API",
    why: "Campaigns must file these reports by law",
    href: "https://www.fec.gov",
    linkText: "fec.gov",
    state: "live",
    offices: ["us_senate"],
  },
  {
    name: "Texas Ethics Commission",
    who: "State agency",
    what: "Who gave to the governor's campaign, and how much",
    how: "Official campaign finance reports",
    why: "State law requires these filings",
    href: "https://www.ethics.state.tx.us",
    linkText: "ethics.state.tx.us",
    state: "planned",
    offices: ["governor"],
  },
];

export function dataSourcesFor(office: string) {
  return DATA_SOURCES.filter((source) => !source.offices || source.offices.includes(office));
}
