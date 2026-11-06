import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AtAGlance } from "@/components/at-a-glance";
import { FlagHero } from "@/components/flag-hero";
import { PromiseExplorer } from "@/components/promise-explorer";
import { SaidDid } from "@/components/said-did";
import { deliveredFor, summarize, termYears } from "@/lib/delivered";
import { formatLongDate, officeLabel } from "@/lib/format";
import { loadLedger, politicianBySlug } from "@/lib/queries";
import { termClock } from "@/lib/term";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const ledger = await loadLedger();
  return ledger.politicians.map((politician) => ({ slug: politician.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ledger = await loadLedger();
  const politician = politicianBySlug(ledger, slug);
  if (!politician) return { title: "Not found" };
  return {
    title: `${politician.name}: promise vs. delivered`,
    description: `What ${politician.name}, ${officeLabel(politician.office)}, promised on the campaign trail, next to what the public record shows they did.`,
  };
}

export default async function PoliticianPage({ params }: Props) {
  const { slug } = await params;
  const ledger = await loadLedger();
  const politician = politicianBySlug(ledger, slug);
  if (!politician) notFound();

  const rows = ledger.promises.filter((promise) => promise.politician_id === politician.id);
  const delivered = deliveredFor(ledger, politician);
  const summary = summarize(delivered);
  const pledges = delivered.filter((promise) => promise.type === "explicit_pledge");
  const topics = [...new Set(rows.map((promise) => promise.topic).filter((topic): topic is string => Boolean(topic)))].sort();
  const clock = termClock(politician.term_start, new Date(ledger.fetchedAt));
  const anyAction = delivered.some((promise) => promise.actions.length > 0);
  const firstName = politician.name.split(" ")[0];
  const startLabel = formatLongDate(politician.term_start);

  const launchNote = anyAction
    ? null
    : clock.phase === "before_term"
      ? `Nothing to compare yet. ${politician.name} takes office on ${startLabel}. Every pledge starts at "No action yet" until there is public evidence.`
      : `No evidence is on record yet. Every pledge stays at "No action yet" until a public record shows action.`;

  const emptyNote =
    clock.phase === "before_term"
      ? `Nothing is on the public record yet. ${firstName}'s term starts on ${startLabel}. Cards appear here as soon as a bill, vote, order, or budget can be tied to a promise.`
      : `Nothing is on the public record yet. Cards appear here as soon as a bill, vote, order, or budget can be tied to a promise.`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-8">
      <FlagHero politician={politician} summary={summary} asOf={ledger.fetchedAt} />

      <AtAGlance pledges={pledges} launchNote={launchNote} />

      <SaidDid
        promises={delivered.filter((promise) => promise.actions.length > 0)}
        years={termYears(politician)}
        emptyNote={emptyNote}
        role={politician.office === "governor" ? "governor" : "senator"}
      />

      <section aria-labelledby="every-promise" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 id="every-promise" className="text-3xl text-ink">
            Every promise on record
          </h2>
          <p className="text-muted-foreground">
            {rows.length} promises: {summary.pledges} explicit {summary.pledges === 1 ? "pledge" : "pledges"} and{" "}
            {summary.platform} platform {summary.platform === 1 ? "line" : "lines"}, each with a verbatim quote and a source.
          </p>
        </div>
        <Suspense fallback={<p role="status">Loading the promise list…</p>}>
          <PromiseExplorer promises={rows} topics={topics} />
        </Suspense>
      </section>
    </div>
  );
}
