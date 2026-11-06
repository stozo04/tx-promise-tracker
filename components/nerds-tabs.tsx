"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";

import { SyncButton } from "@/components/sync-button";
import type { DataSource } from "@/lib/data-sources";
import type { Teaser } from "@/lib/roadmap";
import type { ArchiveCard } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "upcoming" | "record" | "money" | "site" | "data";

function NotLoaded({ teaser, lead }: { teaser?: Teaser; lead: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-dashed border-mesquite/40 bg-card/80 p-6">
      <p className="inline-flex self-start rounded-full bg-limestone px-2.5 py-1 text-xs font-semibold text-ink">
        Not loaded yet
      </p>
      <p className="text-lg leading-7">{lead}</p>
      {teaser ? (
        <p className="text-sm leading-6">
          <span className="font-semibold">Where the records will come from. </span>
          {teaser.sources}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Nothing is shown until it can be copied from a primary public record.{" "}
        <Link href="/roadmap" className="font-semibold underline underline-offset-4">
          Read the roadmap
        </Link>
      </p>
    </div>
  );
}

export function NerdsTabs({
  name,
  office,
  archives,
  dataSources,
  teasers,
  lastSyncedAt,
}: {
  name: string;
  office: string;
  archives: ArchiveCard[];
  dataSources: DataSource[];
  teasers: Teaser[];
  lastSyncedAt: string | null;
}) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const votes = teasers.find((teaser) => teaser.id === "voting_record");
  const money = teasers.find((teaser) => teaser.id === "donations");
  const isGovernor = office === "governor";

  const tabs: { id: Tab; label: string }[] = [
    { id: "upcoming", label: "Upcoming" },
    { id: "record", label: isGovernor ? "Signed & vetoed" : "How they voted" },
    { id: "money", label: "Campaign money" },
    { id: "site", label: "Campaign website" },
    { id: "data", label: "Data sources" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border pb-3">
        <div role="group" aria-label="Sections" className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "min-h-11 rounded-xl border-2 px-4 text-sm font-bold",
                tab === item.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-secondary",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <SyncButton lastSyncedAt={lastSyncedAt} />
        </div>
      </div>

      {tab === "upcoming" ? (
        <NotLoaded
          lead={
            isGovernor
              ? `Upcoming bill deadlines, special sessions, and signing dates for ${name} are not loaded yet.`
              : `Upcoming Senate votes and committee hearings for ${name} are not loaded yet.`
          }
          teaser={votes}
        />
      ) : null}

      {tab === "record" ? (
        <NotLoaded
          lead={
            isGovernor
              ? "Governors do not vote on bills. They sign them, veto them, or let them become law without a signature. That record is not loaded yet."
              : "Roll-call votes are not loaded yet. Each vote will be linked to a promise only when it really bears on it."
          }
          teaser={votes}
        />
      ) : null}

      {tab === "money" ? (
        <NotLoaded
          lead="Donations are not loaded yet. A donor is named only when a public filing proves the name and the amount."
          teaser={money}
        />
      ) : null}

      {tab === "site" ? (
        archives.length === 0 ? (
          <p className="rounded-3xl border border-dashed px-5 py-8">No screenshots of the campaign site are stored yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground">
              Campaign sites change or disappear after an election. These copies were saved so the original wording
              can always be checked.
            </p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {archives.map((card) => (
                <li key={card.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
                  <Image
                    src={card.screenshotUrl}
                    alt={`Screenshot of ${card.title}`}
                    width={640}
                    height={400}
                    className="h-44 w-full object-cover object-top"
                  />
                  <div className="flex flex-col gap-1.5 p-4">
                    <p className="font-semibold leading-snug">{card.title}</p>
                    <p className="text-xs text-muted-foreground">Saved {card.capturedLabel}</p>
                    <p className="flex flex-wrap gap-x-3 text-sm font-semibold">
                      {card.waybackUrl ? (
                        <a href={card.waybackUrl} className="underline underline-offset-4">
                          Internet Archive copy
                        </a>
                      ) : null}
                      <a href={card.pageUrl} className="underline underline-offset-4">
                        Live page
                      </a>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}

      {tab === "data" ? (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3.5 rounded-2xl bg-secondary p-5">
            <RefreshCw className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div className="flex flex-col gap-1.5">
              <p className="font-extrabold">This is what happens when you press Sync</p>
              <p className="leading-7 text-muted-foreground">
                Sync checks every source below for anything new since the last sync, saves new records with a link back
                to the original, and ties them to the promises they relate to. Only official records and the
                candidates&apos; own words are used, never news stories. Sync runs at most once a day for the whole site.
              </p>
            </div>
          </div>
          <ul className="grid gap-4 md:grid-cols-2">
            {dataSources.map((source) => (
              <li key={source.name} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-extrabold">{source.name}</h2>
                    <p className="text-sm text-muted-foreground">{source.who}</p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-bold",
                      source.state === "live" ? "bg-[var(--match-bg)] text-[var(--match-fg)]" : "bg-limestone text-ink",
                    )}
                  >
                    {source.state === "live" ? "In use" : "Planned"}
                  </span>
                </div>
                <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm leading-6">
                  <dt className="pt-0.5 text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">What</dt>
                  <dd>{source.what}</dd>
                  <dt className="pt-0.5 text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">How</dt>
                  <dd>{source.how}</dd>
                  <dt className="pt-0.5 text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
                    Why trust it
                  </dt>
                  <dd>{source.why}</dd>
                </dl>
                {source.href.startsWith("/") ? (
                  <Link href={source.href} className="self-start text-sm font-bold underline underline-offset-4">
                    {source.linkText}
                  </Link>
                ) : (
                  <a
                    href={source.href}
                    className="inline-flex items-center gap-1 self-start text-sm font-bold underline underline-offset-4"
                  >
                    {source.linkText}
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
