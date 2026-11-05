import { formatNumber } from "@/lib/format";
import { STATED_RESULTS } from "@/lib/stated-results";

export function VoteLine({ slug }: { slug: string }) {
  const result = STATED_RESULTS[slug];
  if (!result) return null;
  const total = result.votes + result.opponentVotes;
  const share = Math.round((result.votes / total) * 1000) / 10;

  return (
    <div className="space-y-2">
      <p className="text-sm leading-6">
        Reported result: {formatNumber(result.votes)} to {result.opponent}&apos;s{" "}
        {formatNumber(result.opponentVotes)} ({share}% of those two totals).
      </p>
      <div
        className="flex h-2 overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--ring-track)" }}
        role="img"
        aria-label={`${share}% of the two reported totals`}
      >
        <div style={{ width: `${share}%`, backgroundColor: "var(--bluebonnet)" }} />
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Recorded for this project. Not a column in the promise database, and not a
        return this site certifies.
      </p>
    </div>
  );
}
