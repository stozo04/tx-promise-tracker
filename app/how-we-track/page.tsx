import type { Metadata } from "next";
import Link from "next/link";

import { StatusPill } from "@/components/status-pill";
import { formatTimestamp, statusHelp } from "@/lib/format";
import { loadLedger } from "@/lib/queries";
import { GITHUB_REPO_URL, INDEPENDENT_DISCLAIMER } from "@/lib/site";
import { STATUSES } from "@/lib/types";

export const metadata: Metadata = {
  title: "How we track",
  description: "Every promise links a primary source. A status changes only with public evidence.",
};

export default async function HowWeTrackPage() {
  const ledger = await loadLedger();
  const latest = [...ledger.ingestRuns].sort((a, b) =>
    (b.finished_at ?? b.started_at).localeCompare(a.finished_at ?? a.started_at),
  )[0];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="space-y-3">
        <h1 className="text-4xl text-ink sm:text-5xl">How we track</h1>
        <p className="text-lg leading-8">
          A promise enters the ledger with the words someone actually published, and a link back to them.
          A status stays pending until evidence is public.
        </p>
        <p className="rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-6">
          {INDEPENDENT_DISCLAIMER}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-2xl">What counts</h2>
        <p className="leading-7">
          An explicit pledge is a line where they say they will do a thing: “When I’m governor, I will…”
          A platform line is a position published on a campaign issues page. Both are tracked. The label
          tells you which kind you are reading.
        </p>
        <p className="leading-7">
          Overlapping wording stays as separate rows when each one has its own source quote. We do not
          merge them into a score.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl">Primary sources</h2>
        <p className="leading-7">
          Every promise stores a verbatim quote and a source URL. A news paraphrase is not enough. The
          quote has to come from the candidate, the campaign, or another primary record.
        </p>
        <p className="leading-7">
          Right now the ledger holds {ledger.promises.length} promises, {ledger.sources.length} sources,
          and {ledger.snapshots.length} snapshots.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl">Archives</h2>
        <p className="leading-7">
          When we can, we save the page and a screenshot, and keep an Internet Archive link. Social posts
          do not always have a screenshot. A missing picture does not erase the source link.
        </p>
        <p>
          <Link href="/archives" className="font-semibold text-bluebonnet underline">
            Open the gallery
          </Link>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl">Statuses need evidence</h2>
        <p className="leading-7">
          Nobody gets a kept or a broken on a hunch. The person proposing the change links a public record:
          a vote, a signed bill, a veto, a budget, or their own later statement.
        </p>
        <ul className="space-y-3">
          {STATUSES.map((status) => (
            <li key={status} className="flex flex-col gap-1 rounded-2xl bg-card px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
              <StatusPill status={status} />
              <span className="text-sm leading-6">{statusHelp(status)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl">What this site will not do</h2>
        <ul className="list-disc space-y-2 pl-5 leading-7">
          <li>Pretend to be a campaign or the State of Texas.</li>
          <li>Fill a gap with a made-up quote, vote, or donor.</li>
          <li>Change a status from an anonymous tip.</li>
          <li>Write to the database from the website. The site only reads.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl">Not tracked yet</h2>
        <p className="leading-7">
          Voting records and donations are on the roadmap. Until those records are loaded from a primary
          source, the site shows a coming-soon card and nothing else.
        </p>
        <p>
          <Link href="/roadmap" className="font-semibold text-bluebonnet underline">
            See the roadmap
          </Link>
        </p>
      </section>

      {latest ? (
        <section className="space-y-2">
          <h2 className="text-2xl">Latest recorded ingest</h2>
          <p className="text-sm leading-6">
            {latest.notes || latest.source_type}. Finished {formatTimestamp(latest.finished_at) ?? "without a finish time"}.
            Those run counts are history. The live totals above come from the tables now.
          </p>
          {Array.isArray(latest.errors) && latest.errors.length === 0 ? (
            <p className="text-sm">That run recorded no errors.</p>
          ) : (
            <pre className="overflow-x-auto rounded-2xl bg-card p-3 text-xs">
              {JSON.stringify(latest.errors, null, 2)}
            </pre>
          )}
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-2xl">Challenge a record</h2>
        <p className="leading-7">
          Open an issue on GitHub with the quote, the source, and, for a status change, the evidence.
          The contributing guide in the README walks through both.
        </p>
        <p>
          <a className="font-semibold text-bluebonnet underline" href={GITHUB_REPO_URL}>
            Open / Collab
          </a>
        </p>
      </section>
    </div>
  );
}
