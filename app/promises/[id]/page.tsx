import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LedgerLoading } from "@/components/ledger-loading";
import { StatusPill } from "@/components/status-pill";
import {
  decidedByLabel,
  formatLongDate,
  formatTimestamp,
  hostname,
  officeLabel,
  statusLabel,
  topicLabel,
  typeLabel,
} from "@/lib/format";
import { snapshotsForPromise } from "@/lib/present";
import { loadLedger } from "@/lib/queries";
import { storagePublicUrl } from "@/lib/urls";

type Props = { params: Promise<{ id: string }> };

export async function generateStaticParams() {
  const ledger = await loadLedger();
  return ledger.promises.map((promise) => ({ id: promise.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ledger = await loadLedger();
  const promise = ledger.promises.find((row) => row.id === id);
  if (!promise) return { title: "Promise not found" };
  return {
    title: promise.summary_text.slice(0, 80),
    description: promise.verbatim_quote.slice(0, 160),
  };
}

/** The page returns at once and the promise streams in under Suspense, so navigating here never blocks on params. */
export default function PromisePage({ params }: Props) {
  return (
    <Suspense fallback={<LedgerLoading />}>
      <PromiseRecord params={params} />
    </Suspense>
  );
}

async function PromiseRecord({ params }: Props) {
  const { id } = await params;
  const ledger = await loadLedger();
  const promise = ledger.promises.find((row) => row.id === id);
  if (!promise) notFound();

  const politician = ledger.politicians.find((person) => person.id === promise.politician_id);
  const source = promise.source_id
    ? ledger.sources.find((row) => row.id === promise.source_id)
    : undefined;
  const snapshots = snapshotsForPromise(ledger, promise);
  const updates = ledger.statusUpdates.filter((update) => update.promise_id === promise.id);
  const latest = updates.at(-1);
  const same = promise.summary_text.trim() === promise.verbatim_quote.trim();
  const related = ledger.promises
    .filter(
      (row) =>
        row.id !== promise.id &&
        row.politician_id === promise.politician_id &&
        row.topic === promise.topic,
    )
    .slice(0, 3);

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <p className="text-sm">
        <Link href="/" className="text-bluebonnet underline">
          Scoreboard
        </Link>
        {politician ? (
          <>
            {" / "}
            <Link href={`/politicians/${politician.slug}`} className="text-bluebonnet underline">
              {politician.name}
            </Link>
          </>
        ) : null}
      </p>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusPill status={promise.status} />
          <span className="rounded-full bg-secondary px-2 py-1 font-medium">
            {typeLabel(promise.promise_type)}
          </span>
          <span className="text-muted-foreground">{topicLabel(promise.topic)}</span>
        </div>
        {politician ? (
          <p className="text-sm text-muted-foreground">
            {politician.name} · {officeLabel(politician)}
          </p>
        ) : null}
        {same ? (
          <h1 className="rounded-3xl border border-dashed border-border bg-card p-6 text-3xl leading-snug text-ink">
            {promise.verbatim_quote}
          </h1>
        ) : (
          <h1 className="text-3xl leading-snug text-ink sm:text-4xl">{promise.summary_text}</h1>
        )}
      </header>

      {same ? null : (
        <figure className="rounded-3xl border border-dashed border-border bg-card p-6">
          <figcaption className="text-xs font-semibold uppercase tracking-[0.14em] text-mesquite">
            In their words
          </figcaption>
          <blockquote className="mt-3 text-xl leading-8 text-ink">{promise.verbatim_quote}</blockquote>
        </figure>
      )}

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-2xl bg-card px-4 py-3">
          <dt className="text-muted-foreground">Date said</dt>
          <dd>{formatLongDate(promise.date_said) ?? "Not recorded on the source we have"}</dd>
        </div>
        <div className="rounded-2xl bg-card px-4 py-3">
          <dt className="text-muted-foreground">Confidence in the quote</dt>
          <dd>{promise.confidence ?? "Not recorded"}</dd>
        </div>
      </dl>

      <section className="space-y-2">
        <h2 className="text-2xl text-ink">Primary source</h2>
        <p>
          <a className="font-semibold text-bluebonnet underline" href={promise.archive_url ?? promise.source_url}>
            Read the archived source{!promise.archive_url ? ` at ${hostname(promise.source_url)}` : ""}
          </a>
        </p>
        {source?.title ? <p className="text-sm text-muted-foreground">{source.title}</p> : null}
        {source?.source_type ? (
          <p className="text-sm text-muted-foreground">Source type: {source.source_type}</p>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl text-ink">Archived snapshot</h2>
        {snapshots.length === 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">
            No archived page is stored for this source yet. The link above is still the primary source.
          </p>
        ) : (
          snapshots.map((snapshot) => {
            const shot = storagePublicUrl(ledger.supabaseUrl, snapshot.screenshot_storage_path);
            const html = storagePublicUrl(ledger.supabaseUrl, snapshot.html_storage_path);
            return (
              <div key={snapshot.id} className="space-y-3 rounded-3xl border border-border bg-card p-4">
                <h3 className="text-lg">{snapshot.title || "Saved page"}</h3>
                <p className="text-sm text-muted-foreground">
                  Captured {formatTimestamp(snapshot.captured_at)}
                  {snapshot.capture_method ? ` · ${snapshot.capture_method}` : ""}
                </p>
                {shot ? (
                  <Image
                    src={shot}
                    alt={`Archived screenshot of ${snapshot.title || snapshot.url}`}
                    width={1400}
                    height={900}
                    unoptimized
                    className="h-auto w-full rounded-2xl border border-border"
                  />
                ) : (
                  <p className="text-sm">A screenshot was not saved for this page.</p>
                )}
                <div className="flex flex-wrap gap-3 text-sm">
                  {snapshot.wayback_url ? (
                    <a className="font-semibold text-bluebonnet underline" href={snapshot.wayback_url}>
                      Internet Archive copy
                    </a>
                  ) : null}
                  {html ? (
                    <a className="font-semibold text-bluebonnet underline" href={html}>
                      Saved HTML
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl text-ink">Status timeline</h2>
        {latest && latest.status !== promise.status ? (
          <p className="text-sm">
            The promise row says {statusLabel(promise.status)}. The latest status update says{" "}
            {statusLabel(latest.status)}. Both are shown as stored.
          </p>
        ) : null}
        <ol className="space-y-4 border-l border-border pl-4">
          <li>
            <p className="font-semibold">Entered the ledger as {statusLabel(promise.status)}</p>
            <p className="text-sm text-muted-foreground">{formatTimestamp(promise.created_at)}</p>
            <p className="mt-1 text-sm leading-6">
              This is when the quote was recorded. It is not a judgment that the promise was kept or broken.
            </p>
          </li>
          {updates.map((update) => (
            <li key={update.id}>
              <p className="font-semibold">Marked {statusLabel(update.status)}</p>
              <p className="text-sm text-muted-foreground">
                {formatTimestamp(update.decided_at)} · Decided by {decidedByLabel(update.decided_by)}
              </p>
              {update.evidence_note ? <p className="mt-1 text-sm leading-6">{update.evidence_note}</p> : null}
              {update.evidence_url ? (
                <p className="mt-1 text-sm">
                  <a className="font-semibold text-bluebonnet underline" href={update.evidence_url}>
                    Evidence
                  </a>
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">No evidence link was stored with this update.</p>
              )}
            </li>
          ))}
        </ol>
        {updates.length === 0 ? (
          <p className="text-sm leading-6">
            No status updates have been filed. A promise stays pending until someone links public evidence.
          </p>
        ) : null}
      </section>

      {promise.notes ? (
        <section>
          <h2 className="text-2xl text-ink">Notes stored with the promise</h2>
          <p className="mt-2 text-sm leading-6">{promise.notes}</p>
        </section>
      ) : null}

      {related.length > 0 && politician ? (
        <section className="space-y-2">
          <h2 className="text-2xl text-ink">More on {topicLabel(promise.topic).toLowerCase()}</h2>
          <ul className="space-y-2 text-sm">
            {related.map((row) => (
              <li key={row.id}>
                <Link href={`/promises/${row.id}`} className="text-bluebonnet underline">
                  {row.summary_text}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
