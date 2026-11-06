import type { Metadata } from "next";
import Link from "next/link";

import { ComingSoon } from "@/components/coming-soon";
import { teasersFor } from "@/lib/roadmap";
import { GITHUB_REPO_URL, INDEPENDENT_DISCLAIMER } from "@/lib/site";

export const metadata: Metadata = {
  title: "Roadmap",
  description: "What the tracker shows today, what Sync loads automatically, and what is still added by hand.",
};

export default function RoadmapPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-10">
      <header className="space-y-3">
        <h1 className="text-4xl text-ink sm:text-5xl">Roadmap</h1>
        <p className="text-lg leading-8">
          The promise ledger is live. Two more public records are planned. Neither has been loaded, so
          this page does not show a sample vote or a sample donor.
        </p>
        <p className="text-sm leading-6 text-muted-foreground">{INDEPENDENT_DISCLAIMER}</p>
      </header>

      <section className="space-y-2 rounded-3xl bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cactus">Live</p>
        <h2 className="text-2xl">Promises, sources, and archives</h2>
        <p className="leading-7">
          Quotes, topics, pledge versus platform, and a status that stays pending until evidence exists.
          Screenshots and saved pages sit in the archives.
        </p>
        <p>
          <Link href="/#scoreboard" className="font-semibold text-bluebonnet underline">
            Go to the scoreboard
          </Link>
        </p>
      </section>

      <ComingSoon teasers={teasersFor()} heading="Coming soon" />

      <section className="space-y-3">
        <h2 className="text-2xl">Voting record</h2>
        <p className="leading-7">
          The goal is to show how each official votes after they take office, and to link a vote to a
          promise only when the vote actually bears on that promise.
        </p>
        <ul className="list-disc space-y-2 pl-5 leading-7">
          <li>James Talarico, U.S. Senate: Congress.gov and Senate roll calls. Loaded by Sync once his term starts.</li>
          <li>Gina Hinojosa, Governor of Texas: Texas bill signings and vetoes. Added by hand for now.</li>
        </ul>
        <p className="leading-7">
          A vote is shown only after it is copied from one of those public records. A missing link to a
          promise means we have not tied them. It is not a claim that the vote is unrelated.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl">Donations</h2>
        <p className="leading-7">
          The goal is to show who contributed, with the filing that proves the name and the amount.
        </p>
        <ul className="list-disc space-y-2 pl-5 leading-7">
          <li>James Talarico: FEC filings. Loaded by Sync.</li>
          <li>Gina Hinojosa: Texas Ethics Commission reports. Not automated yet.</li>
        </ul>
        <p className="leading-7">
          A contributor is named only when that filing is linked. Amounts come from the filing, not from
          an estimate. The site will not rank donors or imply that a gift bought a promise.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl">Help build it</h2>
        <p className="leading-7">
          Automating the governor&apos;s records and the Texas Ethics Commission reports has not started. The
          GitHub repo has issue templates for a voting-record plan and a donations plan, plus templates for a new promise and a status change. Do not attach invented
          rows to make a demo.
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
