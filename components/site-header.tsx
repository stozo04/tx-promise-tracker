import { BrandLink, SiteNav } from "@/components/site-nav";
import { TexasStarLogo } from "@/components/texas-star-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { GITHUB_REPO_URL, SITE_NAME } from "@/lib/site";

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function SiteHeader({
  politicians,
}: {
  politicians: { name: string; slug: string; office: string; district: string | null }[];
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <BrandLink people={politicians} className="mr-auto flex items-center gap-2 text-ink sm:mr-0">
          <TexasStarLogo className="size-8 shrink-0" />
          <span className="leading-tight">
            <span className="block font-heading text-lg font-semibold">{SITE_NAME}</span>
            <span className="block text-xs text-muted-foreground">Texas · a public receipt book</span>
          </span>
        </BrandLink>
        <SiteNav people={politicians} />
        <ThemeToggle />
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Contribute on GitHub (opens in a new tab)"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border-2 border-border px-3.5 text-sm font-bold hover:bg-secondary"
        >
          <GitHubMark className="size-4" />
          Contribute
        </a>
      </div>
    </header>
  );
}
