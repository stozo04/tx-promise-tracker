/**
 * Vote totals are not columns in tx_tracker.
 * They are the figures supplied for this public tracker.
 * The site labels them as such and does not treat them as certified returns.
 */
export const STATED_RESULTS: Record<
  string,
  { votes: number; opponent: string; opponentVotes: number }
> = {
  "james-talarico": {
    votes: 5444982,
    opponent: "Paxton",
    opponentVotes: 4249373,
  },
  "gina-hinojosa": {
    votes: 5230789,
    opponent: "Abbott",
    opponentVotes: 4524527,
  },
};
