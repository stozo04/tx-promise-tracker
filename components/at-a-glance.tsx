import Link from "next/link";

import type { DeliveredAction, DeliveredPromise } from "@/lib/delivered";
import { formatLongDate } from "@/lib/format";

const VISIBLE_ROWS = 8;

function squareLabel(action: DeliveredAction, kind: "Matched" | "Went against") {
  const what = action.note ?? "Evidence on record";
  return `${kind}: ${what}, ${formatLongDate(action.decidedAt)}. Click to see the proof.`;
}

function Row({ pledge }: { pledge: DeliveredPromise }) {
  const against = pledge.actions.filter((action) => action.direction === "against");
  const match = pledge.actions.filter((action) => action.direction === "match");
  const quiet = pledge.actions.length === 0;

  return (
    <li className="grid min-h-11 grid-cols-[minmax(0,1fr)_minmax(3rem,9rem)_2px_minmax(3rem,9rem)] items-center gap-x-3 border-t border-border pt-2">
      <Link
        href={`/promises/${pledge.id}`}
        className="font-bold underline decoration-1 underline-offset-4"
      >
        {pledge.summary}
      </Link>
      <span className="flex flex-wrap justify-end gap-1">
        {against.map((action) => (
          <a
            key={action.id}
            href={`#action-${action.id}`}
            aria-label={squareLabel(action, "Went against")}
            title={squareLabel(action, "Went against")}
            className="block size-7 rounded-[5px] bg-[var(--against-fg)]"
          />
        ))}
      </span>
      <span aria-hidden="true" className="self-stretch bg-foreground/50" />
      <span className="flex flex-wrap items-center gap-1">
        {match.map((action) => (
          <a
            key={action.id}
            href={`#action-${action.id}`}
            aria-label={squareLabel(action, "Matched")}
            title={squareLabel(action, "Matched")}
            className="block size-7 rounded-[5px] bg-[var(--match-fg)]"
          />
        ))}
        {quiet ? <span className="text-sm italic text-muted-foreground">No action yet</span> : null}
      </span>
    </li>
  );
}

/** One row per explicit pledge: actions that went against it on the left, actions that matched it on the right. */
export function AtAGlance({ pledges, launchNote }: { pledges: DeliveredPromise[]; launchNote: string | null }) {
  const first = pledges.slice(0, VISIBLE_ROWS);
  const rest = pledges.slice(VISIBLE_ROWS);

  return (
    <section aria-labelledby="at-a-glance" className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="at-a-glance" className="text-2xl text-ink sm:text-3xl">
          Promise vs. action, at a glance
        </h2>
        <p className="text-sm text-muted-foreground">
          Each square is one cited action. Click a pledge or a square to see the proof.
        </p>
      </div>
      {launchNote ? (
        <p className="rounded-2xl bg-secondary px-4 py-3 text-sm leading-6">{launchNote}</p>
      ) : null}
      <div
        aria-hidden="true"
        className="grid grid-cols-[minmax(0,1fr)_minmax(3rem,9rem)_2px_minmax(3rem,9rem)] gap-x-3 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground"
      >
        <span>Pledge</span>
        <span className="text-right text-[var(--against-fg)]">Went against it</span>
        <span />
        <span className="text-[var(--match-fg)]">Matched it</span>
      </div>
      <ul className="flex flex-col gap-2">
        {first.map((pledge) => (
          <Row key={pledge.id} pledge={pledge} />
        ))}
      </ul>
      {rest.length > 0 ? (
        <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border-2 border-border px-4 text-sm font-bold">
            <span className="group-open:hidden">Show all {pledges.length} pledges</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {rest.map((pledge) => (
              <Row key={pledge.id} pledge={pledge} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
