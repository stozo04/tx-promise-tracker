import type { Metadata } from "next";

import { AgentPrompt } from "@/components/agent-prompt";
import { GITHUB_REPO_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "For your agent",
  description: "A ready-made prompt that lets your AI agent read the Promise vs. Delivered API and report updates.",
};

export default function AgentsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="space-y-3">
        <h1 className="text-4xl text-ink sm:text-5xl">For your agent</h1>
        <p className="text-lg leading-8">
          Skip the clicking. Copy this prompt, hand it to ChatGPT, Claude, or any AI agent that can open web pages,
          and let it do the reading. Then just ask, &ldquo;Did Hinojosa keep any promises this week?&rdquo; You get
          the answer with sources, and your mouse gets the day off.
        </p>
      </header>
      <AgentPrompt fallbackOrigin={process.env.NEXT_PUBLIC_SITE_URL ?? ""} />
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
