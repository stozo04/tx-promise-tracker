import Link from "next/link";

import { StarMark } from "@/components/star-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { GITHUB_REPO_URL, SITE_NAME } from "@/lib/site";
import { cn } from "@/lib/utils";

export function SiteHeader({
  politicians,
}: {
  politicians: { name: string; slug: string }[];
}) {
  const links = [
    { href: "/#scoreboard", label: "Scoreboard" },
    ...politicians.map((politician) => ({
      href: `/politicians/${politician.slug}`,
      label: politician.name.split(" ")[0],
    })),
    { href: "/archives", label: "Archives" },
    { href: "/roadmap", label: "Roadmap" },
    { href: "/how-we-track", label: "How we track" },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 text-ink">
            <StarMark className="size-7 text-bluebonnet" />
            <span className="leading-tight">
              <span className="block font-heading text-lg font-semibold">{SITE_NAME}</span>
              <span className="block text-xs text-muted-foreground">A public receipt book</span>
            </span>
          </Link>
          <ThemeToggle className="sm:hidden" />
          <a
            href={GITHUB_REPO_URL}
            className={cn(buttonVariants({ size: "lg" }), "h-10 rounded-full px-4 sm:hidden")}
          >
            Open / Collab
          </a>
        </div>
        <nav aria-label="Primary" className="flex gap-1 overflow-x-auto text-sm sm:flex-1 sm:flex-wrap">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="shrink-0 rounded-full px-2 py-1 hover:bg-secondary">
              {link.label}
            </Link>
          ))}
        </nav>
        <ThemeToggle className="hidden sm:inline-flex" />
        <a
          href={GITHUB_REPO_URL}
          className={cn(buttonVariants({ size: "lg" }), "hidden h-10 rounded-full px-4 sm:inline-flex")}
        >
          Open / Collab
        </a>
      </div>
    </header>
  );
}
