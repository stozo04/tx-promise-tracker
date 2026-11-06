import Image from "next/image";
import Link from "next/link";

import { ComingSoon } from "@/components/coming-soon";
import { OathCountdown } from "@/components/oath-countdown";
import { PromiseCard } from "@/components/promise-card";
import { SegmentedRing } from "@/components/segmented-ring";
import { StarMark } from "@/components/star-mark";
import { StatusBar, StatusTally } from "@/components/status-tally";
import { StatusPill } from "@/components/status-pill";
import { screenshotCards } from "@/lib/archives";
import {
  formatTimestamp,
  officeLabel,
  scoredShare,
  statusLabel,
  tally,
} from "@/lib/format";
import { normalizeUrl, storagePublicUrl } from "@/lib/urls";
import { loadLedger } from "@/lib/queries";
import { teasersFor } from "@/lib/roadmap";
import { INDEPENDENT_DISCLAIMER } from "@/lib/site";
import { termClock } from "@/lib/term";
import { STATUSES } from "@/lib/types";

export default async function HomePage() {
  const ledger = await loadLedger();
  const counts = tally(ledger.promises);
  const share = scoredShare(counts);
  const barLabel = STATUSES.filter((status) => counts[status] > 0)
    .map((status) => `${counts[status]} ${statusLabel(status).toLowerCase()}`)
    .join(", ");
  const cards = screenshotCards(ledger);
  const homepages = ledger.politicians
    .map((politician) => {
      const snapshot = ledger.snapshots.find(
        (item) =>
          item.politician_id === politician.id &&
          item.screenshot_storage_path &&
          politician.campaign_site_url &&
          normalizeUrl(item.url) === normalizeUrl(politician.campaign_site_url),
      );
      if (!snapshot?.screenshot_storage_path) return null;
      return {
        politician,
        src: storagePublicUrl(ledger.supabaseUrl, snapshot.screenshot_storage_path)!,
        title: snapshot.title || `${politician.name} campaign site`,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-16 px-4 py-10">
      <section className="relative overflow-hidden">
        <StarMark className="pointer-events-none absolute -top-8 right-0 size-56 text-bluebonnet/10" />
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-bluebonnet">
          Independent civic ledger
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl text-ink sm:text-6xl">
          A receipt book for what they promised.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8">
          James Talarico and Gina Hinojosa were elected on November 3, 2026. This tracker
          keeps the pledges and platform lines they put on the record, each one tied to a
          source, so anyone can check later whether the work got done.
        </p>
        <p className="mt-4 max-w-2xl rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-6">
          {INDEPENDENT_DISCLAIMER}
        </p>
        <dl className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-3xl bg-card px-4 py-4">
            <dt className="text-sm text-muted-foreground">Promises on the record</dt>
            <dd className="font-heading text-4xl text-ink">{ledger.promises.length}</dd>
          </div>
          <div className="rounded-3xl bg-card px-4 py-4">
            <dt className="text-sm text-muted-foreground">Scored so far</dt>
            <dd className="font-heading text-4xl text-ink">{share.scored}</dd>
          </div>
          <div className="rounded-3xl bg-card px-4 py-4">
            <dt className="text-sm text-muted-foreground">Archived screenshots</dt>
            <dd className="font-heading text-4xl text-ink">{cards.length}</dd>
          </div>
        </dl>
      </section>

      <section id="scoreboard" className="space-y-6 scroll-mt-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl text-ink sm:text-4xl">The scoreboard</h2>
          <p className="mt-2 text-lg leading-7">
            Blank until the work starts. That is the point. Every promise is pending until
            a public record shows what happened.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Read from the ledger {formatTimestamp(ledger.fetchedAt)}. Counts refresh about
            once a minute.
          </p>
        </div>
        <StatusBar counts={counts} label={barLabel} />
        <div className="flex flex-wrap gap-2">
          {STATUSES.filter((status) => counts[status] > 0).map((status) => (
            <span key={status} className="inline-flex items-center gap-2">
              <StatusPill status={status} />
              <span className="text-sm">{counts[status]}</span>
            </span>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {ledger.politicians.map((politician) => {
            const rows = ledger.promises.filter((promise) => promise.politician_id === politician.id);
            const personCounts = tally(rows);
            const clock = termClock(politician.term_start, new Date(ledger.fetchedAt));
            const ringLabel = `${politician.name}: ${rows.length} promises, ${personCounts.pending ?? 0} pending`;
            return (
              <article key={politician.id} className="space-y-4 rounded-3xl border border-border bg-card p-5">
                <div>
                  <p className="text-sm font-semibold text-bluebonnet">{officeLabel(politician.office)}</p>
                  <h3 className="text-3xl text-ink">
                    <Link href={`/politicians/${politician.slug}`} className="underline-offset-4 hover:underline">
                      {politician.name}
                    </Link>
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {politician.party ?? "Party not recorded"}
                    {politician.election_date ? ` · Elected ${politician.election_date}` : ""}
                    {politician.status === "elect" && clock.phase === "before_term"
                      ? " · Elected, not yet sworn in"
                      : ""}
                  </p>
                </div>
                {politician.term_start ? (
                  <OathCountdown
                    name={politician.name}
                    termStart={politician.term_start}
                    asOf={ledger.fetchedAt}
                  />
                ) : (
                  <p className="text-sm">Term start is not recorded yet.</p>
                )}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <SegmentedRing counts={personCounts} label={ringLabel} />
                  <StatusTally counts={personCounts} />
                </div>
                <Link
                  href={`/politicians/${politician.slug}`}
                  className="inline-block text-sm font-semibold text-bluebonnet underline"
                >
                  Read {rows.length} promises
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <ComingSoon teasers={teasersFor()} />

      <section className="space-y-4">
        <h2 className="text-3xl text-ink">How a promise moves</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {[
            ["Pending", "We have the quote and the source. Nothing has been scored."],
            ["In progress", "A public step started. The promise is not finished."],
            ["Kept, partial, or broken", "A status changes only when evidence is public."],
          ].map(([title, body]) => (
            <li key={title} className="rounded-3xl bg-card p-5">
              <h3 className="text-xl text-ink">{title}</h3>
              <p className="mt-2 text-sm leading-6">{body}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm">
          <Link href="/how-we-track" className="font-semibold text-bluebonnet underline">
            Read how a status earns its label
          </Link>
        </p>
      </section>

      <SamplePledges ledgerPoliticians={ledger.politicians} promises={ledger.promises} />

      {homepages.length > 0 ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-3xl text-ink">The campaign sites, archived</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Saved copies of their own sites. If the wording changes later, the snapshot stays.
              </p>
            </div>
            <Link href="/archives" className="text-sm font-semibold text-bluebonnet underline">
              Browse the archives
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {homepages.map((home) => (
              <Link
                key={home.politician.id}
                href="/archives"
                className="overflow-hidden rounded-3xl border border-border bg-card"
              >
                <span className="relative block aspect-[16/10]">
                  <Image
                    src={home.src}
                    alt={`Archived screenshot of ${home.title}`}
                    fill
                    unoptimized
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover object-top"
                  />
                </span>
                <span className="block p-4 text-sm font-semibold">{home.politician.name}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SamplePledges({
  ledgerPoliticians,
  promises,
}: {
  ledgerPoliticians: { id: string; name: string }[];
  promises: {
    id: string;
    politician_id: string;
    promise_type: string;
    verbatim_quote: string;
    date_said: string | null;
    summary_text: string;
    topic: string | null;
    source_url: string;
    archive_url: string | null;
    status: string;
    confidence: string | null;
    notes: string | null;
    source_id: string | null;
    created_at: string;
    updated_at: string;
  }[];
}) {
  const samples = ledgerPoliticians.flatMap((politician) =>
    promises
      .filter(
        (promise) =>
          promise.politician_id === politician.id &&
          promise.promise_type === "explicit_pledge" &&
          promise.verbatim_quote.trim().length >= 40,
      )
      .slice(0, 2)
      .map((promise) => ({ promise, name: politician.name })),
  );

  if (samples.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-3xl text-ink">A few lines, in their words</h2>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
        Newest explicit pledges that are more than a short line. The full list is on each profile.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {samples.map(({ promise, name }) => (
          <PromiseCard key={promise.id} promise={promise} politicianName={name} />
        ))}
      </div>
    </section>
  );
}
