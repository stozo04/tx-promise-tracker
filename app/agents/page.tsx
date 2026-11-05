import type { Metadata } from "next";
import Link from "next/link";

import { GITHUB_REPO_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "For agents",
  description: "How an AI agent should read the Texas Promise Tracker API without inventing records.",
};

const ENDPOINTS = [
  ["GET /api/politicians", "The people in the ledger, plus a note that votes and donations are not tracked."],
  ["GET /api/politicians/{slug}/summary", "Counts by status, type, and topic, and the days until the term or days in office."],
  ["GET /api/promises", "Filter with politician, topic, status, type, q, and source. Page with limit and offset."],
  ["GET /api/promises/{id}", "One promise, its source, matching archives, and the status timeline. The timeline may be empty."],
  ["GET /api/sources", "Primary sources. Optional politician slug."],
  ["GET /api/openapi.json", "The machine-readable description of those routes."],
  ["GET /llms.txt", "Short rules for agents, with links."],
];

export default function AgentsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="space-y-3">
        <h1 className="text-4xl text-ink sm:text-5xl">For agents</h1>
        <p className="text-lg leading-8">
          If you are a person, you can skip this page. If you are software reading the ledger, use the
          JSON routes and quote only what they return.
        </p>
      </header>
      <section className="space-y-3">
        <h2 className="text-2xl">Routes</h2>
        <ul className="space-y-3">
          {ENDPOINTS.map(([path, about]) => (
            <li key={path} className="rounded-2xl bg-card px-4 py-3">
              <p className="font-mono text-sm">{path}</p>
              <p className="mt-1 text-sm leading-6">{about}</p>
            </li>
          ))}
        </ul>
        <p className="text-sm">
          Try{" "}
          <Link className="text-bluebonnet underline" href="/api/promises?politician=gina-hinojosa&type=explicit_pledge&status=pending">
            /api/promises?politician=gina-hinojosa&type=explicit_pledge&status=pending
          </Link>
          .
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-2xl">Rules</h2>
        <ol className="list-decimal space-y-2 pl-5 leading-7">
          <li>Read only. There is no write endpoint.</li>
          <li>When you cite a promise, use verbatim_quote and source_url.</li>
          <li>pending means not scored yet. It does not mean the promise failed.</li>
          <li>If a field is null, say it is not recorded.</li>
          <li>Voting records and donations are not in the API. Do not invent votes, bill numbers, donors, or amounts. Point people to /roadmap.</li>
          <li>Vote totals on the human pages are labeled as figures recorded for this project. They are not in these JSON routes.</li>
        </ol>
      </section>
      <p className="text-sm">
        <a className="font-semibold text-bluebonnet underline" href="/llms.txt">
          llms.txt
        </a>
        {" · "}
        <a className="font-semibold text-bluebonnet underline" href="/api/openapi.json">
          OpenAPI
        </a>
        {" · "}
        <a className="font-semibold text-bluebonnet underline" href={GITHUB_REPO_URL}>
          GitHub
        </a>
      </p>
    </div>
  );
}
