import Link from "next/link";

import { ShowMore } from "@/components/show-more";
import type { DeliveredAction, DeliveredPromise } from "@/lib/delivered";
import { formatLongDate } from "@/lib/format";

const VISIBLE_ROWS = 8;

type SquareKind = "Matched" | "Went against" | "Partly matched" | "Replaced by a newer promise";

const SQUARE_CLASS: Record<SquareKind, string> = {
  "Went against": "bg-[var(--against-fg)]",
  Matched: "bg-[var(--match-fg)]",
  "Partly matched": "bg-[var(--partly-fg)]",
  "Replaced by a newer promise": "border-2 border-foreground/60 bg-transparent",
};

function Square({ action, kind }: { action: DeliveredAction; kind: SquareKind }) {
  const label = squareLabel(action, kind);
  return (
    <a
      href={`#action-${action.id}`}
      aria-label={label}
      title={label}
      className={`block size-7 rounded-[5px] ${SQUARE_CLASS[kind]}`}
    />
  );
}

function squareLabel(action: DeliveredAction, kind: SquareKind) {
  const what = action.note ?? "Evidence on record";
  return `${kind}: ${what}, ${formatLongDate(action.decidedAt)}. Click to see the proof.`;
}

function Row({ pledge }: { pledge: DeliveredPromise }) {
  const against = pledge.actions.filter((action) => action.direction === "against");
  const match = pledge.actions.filter((action) => action.direction === "match");
  const partly = pledge.actions.filter((action) => action.direction === "partly");
  const replaced = pledge.actions.filter((action) => action.direction === "neutral");
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
          <Square key={action.id} action={action} kind="Went against" />
        ))}
      </span>
      <span aria-hidden="true" className="self-stretch bg-foreground/50" />
      <span className="flex flex-wrap items-center gap-1">
        {match.map((action) => (
          <Square key={action.id} action={action} kind="Matched" />
        ))}
        {partly.map((action) => (
          <Square key={action.id} action={action} kind="Partly matched" />
        ))}
        {replaced.map((action) => (
          <Square key={action.id} action={action} kind="Replaced by a newer promise" />
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
      <div className="flex flex-col gap-2">
        <ul className="flex flex-col gap-2">
          {first.map((pledge) => (
            <Row key={pledge.id} pledge={pledge} />
          ))}
        </ul>
        {rest.length > 0 ? (
          <ShowMore total={pledges.length}>
            <ul className="flex flex-col gap-2">
              {rest.map((pledge) => (
                <Row key={pledge.id} pledge={pledge} />
              ))}
            </ul>
          </ShowMore>
        ) : null}
      </div>
    </section>
  );
}
