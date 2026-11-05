import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ComingSoon } from "@/components/coming-soon";
import { OathCountdown } from "@/components/oath-countdown";
import { PromiseExplorer } from "@/components/promise-explorer";
import { SegmentedRing } from "@/components/segmented-ring";
import { StatusTally } from "@/components/status-tally";
import { VoteLine } from "@/components/vote-line";
import { officeLabel, tally } from "@/lib/format";
import { loadLedger, politicianBySlug } from "@/lib/queries";
import { teasersFor } from "@/lib/roadmap";
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
    title: politician.name,
    description: `Promises from ${politician.name}, ${officeLabel(politician.office)}, each one linked to a source.`,
  };
}

export default async function PoliticianPage({ params }: Props) {
  const { slug } = await params;
  const ledger = await loadLedger();
  const politician = politicianBySlug(ledger, slug);
  if (!politician) notFound();

  const rows = ledger.promises.filter((promise) => promise.politician_id === politician.id);
  const counts = tally(rows);
  const topics = [...new Set(rows.map((promise) => promise.topic).filter((topic): topic is string => Boolean(topic)))].sort();
  const clock = termClock(politician.term_start, new Date(ledger.fetchedAt));
  const pledges = rows.filter((promise) => promise.promise_type === "explicit_pledge").length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10">
      <header className="space-y-5">
        <p className="text-sm">
          <Link href="/" className="text-bluebonnet underline">
            Scoreboard
          </Link>
        </p>
        <div>
          <p className="text-sm font-semibold text-bluebonnet">{officeLabel(politician.office)}</p>
          <h1 className="text-4xl text-ink sm:text-5xl">{politician.name}</h1>
          <p className="mt-2 text-muted-foreground">
            {politician.party ?? "Party not recorded"}
            {politician.election_date ? ` · Election day ${politician.election_date}` : ""}
            {politician.status === "elect" && clock.phase === "before_term"
              ? " · Elected, not yet sworn in"
              : ""}
          </p>
        </div>
        {politician.term_start ? (
          <OathCountdown name={politician.name} termStart={politician.term_start} asOf={ledger.fetchedAt} />
        ) : null}
        <div className="grid gap-6 rounded-3xl border border-border bg-card p-5 lg:grid-cols-[auto_1fr]">
          <SegmentedRing
            counts={counts}
            label={`${politician.name}: ${rows.length} promises, ${counts.pending ?? 0} pending`}
          />
          <div className="space-y-4">
            <p className="text-sm leading-6">
              {rows.length} promises · {pledges} explicit {pledges === 1 ? "pledge" : "pledges"} ·{" "}
              {rows.length - pledges} platform {rows.length - pledges === 1 ? "line" : "lines"}
            </p>
            <StatusTally counts={counts} />
            <VoteLine slug={politician.slug} />
          </div>
        </div>
        <ul className="flex flex-wrap gap-3 text-sm">
          {politician.campaign_site_url ? (
            <li>
              <a className="font-semibold text-bluebonnet underline" href={politician.campaign_site_url}>
                Campaign website (theirs)
              </a>
            </li>
          ) : null}
          {politician.x_handle ? (
            <li>
              <a className="font-semibold text-bluebonnet underline" href={`https://x.com/${politician.x_handle}`}>
                @{politician.x_handle} on X
              </a>
            </li>
          ) : null}
          {politician.youtube_url ? (
            <li>
              <a className="font-semibold text-bluebonnet underline" href={politician.youtube_url}>
                YouTube
              </a>
            </li>
          ) : null}
          {politician.official_site_url ? (
            <li>
              <a className="font-semibold text-bluebonnet underline" href={politician.official_site_url}>
                Official office site
              </a>
            </li>
          ) : null}
        </ul>
      </header>

      <ComingSoon teasers={teasersFor(politician.slug)} heading={`Coming soon for ${politician.name.split(" ")[0]}`} />

      <Suspense fallback={<p role="status">Loading the promise list…</p>}>
        <PromiseExplorer promises={rows} topics={topics} />
      </Suspense>
    </div>
  );
}
