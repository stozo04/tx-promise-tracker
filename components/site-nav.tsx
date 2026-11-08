"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { officeShort, officeTitle } from "@/lib/offices";
import { cn } from "@/lib/utils";

type Person = { name: string; slug: string; office: string; district: string | null };

/** Which politician a path is about, and which of their pages it is. */
function locate(pathname: string, people: Person[]) {
  const match = pathname.match(/^\/politicians\/([^/]+)(\/nerds)?\/?$/);
  const slug = match && people.some((person) => person.slug === match[1]) ? match[1] : null;
  const section = !match ? "other" : match[2] ? "nerds" : "delivered";
  return { slug, section };
}

/** The site name. Takes you to the Promise vs. Delivered page for whoever you are looking at. */
export function BrandLink({
  people,
  className,
  children,
}: {
  people: Person[];
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const slug = locate(pathname, people).slug ?? people[0]?.slug;
  return (
    <Link href={slug ? `/politicians/${slug}` : "/"} className={className}>
      {children}
    </Link>
  );
}

/** Section links plus the official switch (Senator / Governor / District N). The switch keeps you on the same section. */
export function SiteNav({ people }: { people: Person[] }) {
  const pathname = usePathname() ?? "/";
  const { slug, section } = locate(pathname, people);
  const current = slug ?? people[0]?.slug;
  const onAgents = pathname.startsWith("/agents");

  const links = [
    { href: `/politicians/${current}/nerds`, label: "For the nerds", active: section === "nerds" },
    { href: "/agents", label: "For your agent", active: onAgents },
  ];

  return (
    <>
      <nav aria-label="Primary" className="flex gap-1 overflow-x-auto text-sm sm:flex-1 sm:flex-wrap">
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            aria-current={link.active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3 py-2 font-semibold hover:bg-secondary",
              link.active && "bg-secondary underline decoration-2 underline-offset-4",
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div role="group" aria-label="Choose official" className="flex shrink-0 gap-1 rounded-xl bg-secondary p-1">
        {people.map((person) => {
          const on = person.slug === slug;
          const href = section === "nerds" ? `/politicians/${person.slug}/nerds` : `/politicians/${person.slug}`;
          return (
            <Link
              key={person.slug}
              href={href}
              aria-current={on ? "page" : undefined}
              title={`${person.name}, ${officeTitle(person)}`}
              className={cn(
                "inline-flex min-h-10 items-center rounded-lg px-3.5 text-sm font-extrabold",
                on ? "bg-foreground text-background" : "text-foreground hover:bg-card",
              )}
            >
              {officeShort(person)}
            </Link>
          );
        })}
      </div>
    </>
  );
}
