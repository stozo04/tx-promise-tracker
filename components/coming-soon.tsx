import Link from "next/link";

import type { Teaser } from "@/lib/roadmap";

export function ComingSoon({
  teasers,
  heading = "Coming soon",
}: {
  teasers: Teaser[];
  heading?: string;
}) {
  return (
    <section aria-labelledby="coming-soon-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-mesquite">Not in the ledger yet</p>
          <h2 id="coming-soon-heading" className="text-3xl text-ink">
            {heading}
          </h2>
        </div>
        <Link href="/roadmap" className="text-sm font-semibold text-bluebonnet underline-offset-4 hover:underline">
          Read the roadmap
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {teasers.map((teaser) => (
          <article
            key={teaser.id}
            className="rounded-3xl border border-dashed border-mesquite/40 bg-card/80 p-5"
          >
            <p className="inline-flex rounded-full bg-limestone px-2.5 py-1 text-xs font-semibold text-ink">
              Coming soon
            </p>
            <h3 className="mt-3 text-2xl text-ink">{teaser.title}</h3>
            <p className="mt-2 text-sm leading-6">{teaser.body}</p>
            <p className="mt-3 text-sm leading-6">
              <span className="font-semibold">Where the records live. </span>
              {teaser.sources}
            </p>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              No records are shown on this card. It is a plan, not a score.
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
