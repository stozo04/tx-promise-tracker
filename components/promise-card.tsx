import Link from "next/link";

import { StatusPill } from "@/components/status-pill";
import { formatLongDate, hostname, topicLabel, typeLabel } from "@/lib/format";
import type { PromiseRow } from "@/lib/types";

export function PromiseCard({
  promise,
  politicianName,
}: {
  promise: PromiseRow;
  politicianName?: string;
}) {
  const same = promise.summary_text.trim() === promise.verbatim_quote.trim();
  const dateLabel = formatLongDate(promise.date_said);

  return (
    <article className="flex h-full flex-col gap-3 rounded-3xl border border-border bg-card p-5 shadow-[0_18px_40px_-32px_rgba(28,36,48,0.8)]">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <StatusPill status={promise.status} />
        <span className="rounded-full bg-secondary px-2 py-1 font-medium">
          {typeLabel(promise.promise_type)}
        </span>
        {promise.topic ? (
          <span className="text-muted-foreground">{topicLabel(promise.topic)}</span>
        ) : null}
      </div>
      <h3 className="text-xl leading-snug text-ink">
        <Link href={`/promises/${promise.id}`} className="underline-offset-4 hover:underline">
          {promise.summary_text}
        </Link>
      </h3>
      {same ? null : (
        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
          {promise.verbatim_quote}
        </p>
      )}
      <p className="mt-auto text-sm text-muted-foreground">
        {politicianName ? `${politicianName} · ` : ""}
        {dateLabel ?? "Date not recorded"} · {hostname(promise.source_url)}
      </p>
    </article>
  );
}
