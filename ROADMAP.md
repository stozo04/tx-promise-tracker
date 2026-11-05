# Roadmap

Texas Promise Tracker currently shows campaign promises, each with a verbatim quote and a primary source. Two more public records are planned. Neither is loaded. The site does not show sample votes or sample donors.

## Live

- Promises, topics, and explicit pledge versus platform
- Statuses that stay pending until there is public evidence
- Sources, archived HTML, and screenshots
- A read-only JSON API for agents

## Coming soon: voting record

Show how each official votes after they take office, and link a vote to a promise only when the vote actually bears on that promise.

- **James Talarico**, U.S. Senate. Possible sources: [Congress.gov](https://www.congress.gov/) and Senate roll calls.
- **Gina Hinojosa**, Governor of Texas. Possible sources: Texas bill signings and vetoes.

Rules:

- No vote is shown until it is copied from a primary public record.
- A link to a promise is optional. Add it only when the connection is real.
- A missing link means we have not tied them. It is not a claim that the vote is unrelated.
- Do not add sample roll calls to make a demo.

Open a [voting record issue](https://github.com/stozo04/tx-promise-tracker/issues/new?template=voting-record.md).

## Coming soon: donations

Show who contributed, with the filing or receipt that proves the name and the amount.

- **James Talarico**: FEC filings.
- **Gina Hinojosa**: Texas Ethics Commission reports.

Rules:

- No contributor is named until the name is in a filing we can link.
- Amounts come from the filing, not from an estimate.
- Do not rank donors or imply that a gift bought a promise.
- Do not add sample donors or dollar amounts.

Open a [donations issue](https://github.com/stozo04/tx-promise-tracker/issues/new?template=donations.md).

## Not started

Both items are plans. The database has no vote table and no contribution table. The API field `not_yet_tracked` says the same thing to agents.
