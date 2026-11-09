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
  /** Limit a source to these offices. Empty means it applies to every office. */
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
    what: "Bills, who filed them, their history, whether the governor signed or vetoed them, and the House and Senate floor calendars and committee meeting notices on the Events calendar",
    how: "Official bill records and TLO's feeds of upcoming calendars and meetings, checked on each sync",
    why: "It is the Legislature's own record of every bill",
    href: "https://capitol.texas.gov",
    linkText: "capitol.texas.gov",
    state: "live",
    offices: ["governor", "tx_lt_governor", "tx_house"],
  },
  {
    name: "Texas House Journal",
    who: "Chief Clerk of the Texas House of Representatives",
    what: "How the representative voted on each record vote",
    how: "Record votes printed in the official House Journal",
    why: "The House records each record vote in its own journal",
    href: "https://house.texas.gov",
    linkText: "house.texas.gov",
    state: "live",
    offices: ["tx_house"],
  },
  {
    name: "Texas Senate Journal",
    who: "Secretary of the Texas Senate",
    what: "Any vote the lieutenant governor casts as presiding officer",
    how: "The official Senate Journal for each day the Senate meets",
    why: "The Senate records its own proceedings in its journal",
    href: "https://journals.senate.texas.gov",
    linkText: "journals.senate.texas.gov",
    state: "live",
    offices: ["tx_lt_governor"],
  },
  {
    name: "Office of the Governor",
    who: "State of Texas",
    what: "Executive orders",
    how: "Each order's own PDF, found through the governor's news archive on each sync",
    why: "Published by the governor's office itself",
    href: "https://gov.texas.gov",
    linkText: "gov.texas.gov",
    state: "live",
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
    name: "U.S. Senate schedules",
    who: "Secretary of the Senate and the Senate's committees",
    what: "The Senate's next meeting, its tentative schedule, and hearings of the senator's committees, on the Events calendar",
    how: "The floor schedule, tentative schedule and hearing schedule senate.gov publishes, checked on each sync; committee membership from senate.gov's member data",
    why: "The Senate posts its own schedule",
    href: "https://www.senate.gov/committees/hearings_meetings.htm",
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
    what: "Who gave to the campaign, and how much",
    how: "Official campaign finance reports",
    why: "State law requires these filings",
    href: "https://www.ethics.state.tx.us",
    linkText: "ethics.state.tx.us",
    state: "live",
    offices: ["governor", "tx_lt_governor", "tx_house"],
  },
  {
    name: "Texas Constitution and statutes",
    who: "Texas Legislative Council (statutes.capitol.texas.gov)",
    what: "Dates the law sets: when the Legislature convenes, the 60th and 140th days of a session, the governor's installation and veto period",
    how: "Each date is computed only as the law states it, from the law's text, which is read again on each sync",
    why: "The law itself sets these dates; each event page cites the section",
    href: "https://statutes.capitol.texas.gov",
    linkText: "statutes.capitol.texas.gov",
    state: "live",
    offices: ["governor", "tx_lt_governor", "tx_house"],
  },
  {
    name: "Campaign events pages",
    who: "Each campaign's own events page, linked from its site",
    what: "Public campaign events on or after the day the term starts, labeled as campaign events",
    how: "The page's own event data (a Squarespace site, or Mobilize's public API for a campaign's Mobilize page), checked on each sync. Events other groups host are left out",
    why: "It is the campaign's own listing of where the official will be",
    href: "/events",
    linkText: "See the Events calendar",
    state: "live",
  },
];

export function dataSourcesFor(office: string) {
  return DATA_SOURCES.filter((source) => !source.offices || source.offices.includes(office));
}
