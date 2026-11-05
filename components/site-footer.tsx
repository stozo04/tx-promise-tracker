import Link from "next/link";

import { GITHUB_REPO_URL, INDEPENDENT_DISCLAIMER } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm leading-6 text-muted-foreground">
        <p>{INDEPENDENT_DISCLAIMER}</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/how-we-track" className="text-ink underline-offset-4 hover:underline">
            How we track
          </Link>
          <Link href="/roadmap" className="text-ink underline-offset-4 hover:underline">
            Roadmap
          </Link>
          <Link href="/agents" className="text-ink underline-offset-4 hover:underline">
            For agents
          </Link>
          <Link href="/archives" className="text-ink underline-offset-4 hover:underline">
            Archives
          </Link>
          <a href={GITHUB_REPO_URL} className="text-ink underline-offset-4 hover:underline">
            Open / Collab on GitHub
          </a>
          <a href="/llms.txt" className="text-ink underline-offset-4 hover:underline">
            llms.txt
          </a>
        </nav>
      </div>
    </footer>
  );
}
