# Roadmap

Texas Promise Tracker currently shows campaign promises, each with a verbatim quote and a primary source. Two more public records are planned. Neither is loaded. The site does not show sample votes or sample donors.

## Live

- Promises, topics, and explicit pledge versus platform
- Statuses that stay pending until there is public evidence
- Sources, archived HTML, and screenshots
- A read-only JSON API for agents

## Live for the senator, by hand for the state offices

- **James Talarico**, U.S. Senate: sponsored and co-sponsored bills (Congress.gov), Senate roll calls (senate.gov), and campaign money (FEC), pulled by Sync.
- **Gina Hinojosa**, Governor of Texas: signings, vetoes, and executive orders are added by hand. Campaign money (Texas Ethics Commission) is not loaded yet.
- **Vikki Goodwin**, Lieutenant Governor of Texas: the office presides over the Texas Senate and votes only in the Committee of the Whole or to break a tie. Its record will come from the Texas Senate Journal and Texas Legislature Online. Campaign money (Texas Ethics Commission) is not loaded yet.
- **Zach Herbert**, Texas House District 112: record votes from the House Journal and Texas Legislature Online once the term starts. Campaign money (Texas Ethics Commission) is not loaded yet.

## Live for every official: topics

- **Topic sweep.** Each Sync reads every official's campaign pages for each topic in the topic registry (`tx_tracker.tx_topics`) and queues keyword matches for review. A match never becomes a promise until a person confirms the verbatim quote and the source.
- **Watched bills.** Each topic lists related bills. Sync reads their history on Texas Legislature Online and the House Journal record votes, and stores how any tracked official voted while serving in the Texas House. Those votes are shown under "Earlier record", apart from the office tracked now.

## Live for every official: events

- **Events calendar** (`/events`). Sync loads session days, floor calendars, committee hearings of each official's own committees, dates the law sets, and campaign events from their primary sources, each event linked to the page or law that sets it. Before the terms start in January 2027, most legislative sources list nothing yet; the page says which sources are not loaded.

## Next

- Automate Texas Legislature Online and Office of the Governor records.
- Automate Texas Ethics Commission campaign finance reports.

## Rules that still apply

- No vote, bill, or donor is shown until it is copied from a primary public record.
- A link to a promise is optional. Add it only when the connection is real.
- Amounts come from the filing, not from an estimate.
- Do not rank donors as a judgment or imply that a gift bought a promise.
- Do not add sample records to make a demo.
