import Image from "next/image";

import { ContactSection, type ContactChannel } from "@/components/contact-section";
import { OathCountdown } from "@/components/oath-countdown";
import { StarMark } from "@/components/star-mark";
import type { DeliveredSummary } from "@/lib/delivered";
import { termEndYear } from "@/lib/delivered";
import { formatLongDate, hostname, officeLabel } from "@/lib/format";
import { termClock } from "@/lib/term";
import type { Politician } from "@/lib/types";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** The Texas flag panel with the official's portrait card and name panel. */
export function FlagHero({
  politician,
  summary,
  asOf,
}: {
  politician: Politician;
  summary: DeliveredSummary;
  asOf: string;
}) {
  const startYear = politician.term_start?.slice(0, 4);
  const endYear = termEndYear(politician);
  // Go by the term clock, not the hand-set status, so the label drops on inauguration day.
  const notSworn =
    politician.status === "elect" && termClock(politician.term_start, new Date(asOf)).phase !== "in_office";
  const term = startYear && endYear ? `Term ${startYear} – ${endYear}` : null;

  const officeChannels: ContactChannel[] = politician.official_site_url
    ? [{ label: "Official site", href: politician.official_site_url, text: hostname(politician.official_site_url) }]
    : [];
  const campaignChannels: ContactChannel[] = [
    politician.campaign_site_url
      ? { label: "Website", href: politician.campaign_site_url, text: hostname(politician.campaign_site_url) }
      : null,
    politician.x_handle
      ? { label: "X", href: `https://x.com/${politician.x_handle}`, text: `@${politician.x_handle}` }
      : null,
    politician.youtube_url ? { label: "YouTube", href: politician.youtube_url, text: "Channel" } : null,
  ].filter((channel): channel is ContactChannel => channel !== null);

  const officeNote = politician.official_site_url
    ? "Office phone numbers and mailing addresses are listed on the official site."
    : `Office phone numbers and mailing addresses will be listed here once the official office site is live${
        politician.term_start ? ` (the term starts ${formatLongDate(politician.term_start)})` : ""
      }. We do not post contact details we cannot source.`;

  const tiles = [
    { value: summary.pledges, label: "explicit pledges on record", tone: "plain" },
    { value: summary.match, label: "actions that match their word", tone: "match" },
    { value: summary.against, label: "actions that go against it", tone: "against" },
    { value: summary.quietPledges, label: "pledges with no action yet", tone: "plain" },
  ] as const;

  return (
    <section
      aria-labelledby="official-name"
      className="relative overflow-hidden rounded-[1.5rem] border border-border"
    >
      <div aria-hidden="true" className="absolute inset-0">
        <div className="absolute inset-y-0 left-0 w-1/3 bg-[var(--flag-blue)]" />
        <div className="absolute left-1/3 right-0 top-0 h-1/2 bg-[var(--flag-white)]" />
        <div className="absolute bottom-0 left-1/3 right-0 h-1/2 bg-[var(--flag-red)]" />
        <StarMark className="absolute left-[16.67%] top-1/2 size-80 -translate-x-1/2 -translate-y-1/2 text-[var(--flag-star)]" />
      </div>

      <div className="relative flex flex-wrap items-center gap-7 p-5 sm:p-8">
        <figure className="mx-auto flex w-56 shrink-0 flex-col gap-2 rounded-2xl bg-card p-2.5 shadow-lg sm:mx-0">
          {politician.portrait_url && politician.portrait_credit ? (
            <>
              <Image
                src={politician.portrait_url}
                alt={`Portrait of ${politician.name}`}
                width={440}
                height={528}
                priority
                className="h-64 w-full rounded-xl object-cover object-top"
              />
              <figcaption className="px-1.5 pb-1 text-xs text-muted-foreground">
                {politician.portrait_source_url ? (
                  <a href={politician.portrait_source_url} className="underline underline-offset-2">
                    {politician.portrait_credit}
                  </a>
                ) : (
                  politician.portrait_credit
                )}
              </figcaption>
            </>
          ) : (
            <>
              <div
                role="img"
                aria-label={`No official portrait of ${politician.name} is stored yet`}
                className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl bg-secondary text-muted-foreground"
              >
                <span className="font-heading text-6xl font-semibold text-ink">{initials(politician.name)}</span>
                <span className="text-xs font-semibold">Official portrait</span>
              </div>
              <figcaption className="px-1.5 pb-1 text-xs text-muted-foreground">
                Shown once there is an official photo with a source.
              </figcaption>
            </>
          )}
        </figure>

        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5 rounded-2xl bg-card p-5 shadow-lg sm:p-7">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-muted-foreground">{officeLabel(politician)}</p>
            <h1 id="official-name" className="text-4xl leading-tight text-ink sm:text-5xl">
              {politician.name}
            </h1>
            <p className="text-muted-foreground">
              {[politician.party, term, notSworn ? "Elected, not yet sworn in" : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          {politician.term_start ? (
            <OathCountdown name={politician.name} termStart={politician.term_start} asOf={asOf} />
          ) : null}

          <ContactSection
            name={politician.name}
            campaignHref={politician.archive_url ?? politician.campaign_site_url}
            officeChannels={officeChannels}
            campaignChannels={campaignChannels}
            officeNote={officeNote}
          />

          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map((tile) => (
              <div
                key={tile.label}
                className={
                  tile.tone === "match"
                    ? "rounded-xl bg-[var(--match-bg)] px-4 py-3 text-[var(--match-fg)]"
                    : tile.tone === "against"
                      ? "rounded-xl bg-[var(--against-bg)] px-4 py-3 text-[var(--against-fg)]"
                      : "rounded-xl bg-secondary px-4 py-3"
                }
              >
                <dt className="sr-only">{tile.label}</dt>
                <dd className="flex flex-col gap-0.5">
                  <span className="text-3xl font-black">{tile.value}</span>
                  <span className="text-sm font-semibold">{tile.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
