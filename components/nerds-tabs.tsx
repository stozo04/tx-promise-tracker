"use client";

import { useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";

import { CommunityVote } from "@/components/community-vote";
import { Dropdown } from "@/components/dropdown";
import { ShowMore } from "@/components/show-more";
import { SyncButton, type SyncSummary } from "@/components/sync-button";
import { actionLabel, officialStance, stanceText } from "@/lib/community";
import type { DataSource } from "@/lib/data-sources";
import { kindLabel, sourcesFor, timeLabel } from "@/lib/events";
import { formatLongDate, formatNumber } from "@/lib/format";
import { earlierRole, officeRecordNote, officeRecordTab, officeRole, officeUpcoming } from "@/lib/offices";
import type { Teaser } from "@/lib/roadmap";
import type {
  ArchiveCard,
  ContributionRow,
  ContributionSummaryRow,
  RecordActionRow,
  UpcomingEventRow,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "upcoming" | "record" | "money" | "site" | "data";

function NotLoaded({ teaser, lead, sources }: { teaser?: Teaser; lead: string; sources?: string }) {
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
      {sources ? (
        <p className="text-sm leading-6">
          <span className="font-semibold">Where the events will come from. </span>
          {sources}
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

function RecordItem({ record, role }: { record: RecordActionRow; role: string }) {
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full border-2 border-foreground px-2.5 py-0.5 font-extrabold">{actionLabel(record)}</span>
        {record.bill_id ? <span className="font-bold">{record.bill_id}</span> : null}
        <span className="text-muted-foreground">{formatLongDate(record.acted_on)}</span>
        {record.result ? <span className="text-muted-foreground">· {record.result}</span> : null}
      </div>
      <p className="font-bold leading-snug">{record.title}</p>
      {record.what_it_does ? <p className="text-sm leading-6">{record.what_it_does}</p> : null}
      <a href={record.source_url} className="inline-flex items-center gap-1 self-start text-sm font-semibold underline underline-offset-4">
        {record.source_name}
        <ExternalLink className="size-3.5" aria-hidden="true" />
      </a>
      <CommunityVote
        itemType="record_action"
        itemId={record.id}
        question="How would you vote?"
        stanceText={stanceText(role, record)}
        officialStance={officialStance(record)}
        role={role}
        compact
      />
    </li>
  );
}

/** Votes and bills from an office held before the one tracked now, grouped by that office. */
function EarlierRecord({ records }: { records: RecordActionRow[] }) {
  const groups = new Map<string, RecordActionRow[]>();
  for (const record of records) {
    const key = record.office_context ?? "";
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  // Newest office first, by the legislature number in "(89th Legislature)". Called sessions sort after the regular one.
  const legislature = (context: string) => Number(context.match(/\((\d+)(?:st|nd|rd|th) Legislature/)?.[1] ?? 0);
  const ordered = [...groups.entries()].sort(
    (a, b) => legislature(b[0]) - legislature(a[0]) || b[0].localeCompare(a[0], "en", { numeric: true }),
  );
  return (
    <section aria-labelledby="earlier-record" className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="earlier-record" className="text-2xl text-ink">
          Earlier record
        </h2>
        <p className="max-w-3xl leading-7 text-muted-foreground">
          Votes and bills from an office held before this one. They are public record, copied from the official
          journals, but they are not actions in the office tracked here. A vote is tied to a promise only when it bears
          on that exact promise.
        </p>
      </div>
      {ordered.map(([context, rows]) => {
        const role = earlierRole(context);
        const first = rows.slice(0, 6);
        const rest = rows.slice(6);
        return (
          <div key={context} className="flex flex-col gap-3">
            <h3 className="text-lg font-extrabold">{context}</h3>
            <ul className="flex flex-col gap-3">
              {first.map((record) => (
                <RecordItem key={record.id} record={record} role={role} />
              ))}
            </ul>
            {rest.length > 0 ? (
              <div className="flex flex-col">
                <ShowMore total={rows.length} noun="records">
                  <ul className="flex flex-col gap-3">
                    {rest.map((record) => (
                      <RecordItem key={record.id} record={record} role={role} />
                    ))}
                  </ul>
                </ShowMore>
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

function formatMoney(value: number | null) {
  if (value === null) return "Not reported";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${formatNumber(Math.round(value))}`;
}

function share(part: number | null, whole: number | null) {
  if (part === null || whole === null || whole === 0) return "Not reported";
  return `${Math.round((part / whole) * 100)}%`;
}

export function NerdsTabs({
  name,
  slug,
  office,
  archives,
  dataSources,
  teasers,
  lastSyncedAt,
  syncSummary,
  records,
  upcoming,
  contributions,
  summary,
  years,
}: {
  name: string;
  slug: string;
  office: string;
  archives: ArchiveCard[];
  dataSources: DataSource[];
  teasers: Teaser[];
  lastSyncedAt: string | null;
  syncSummary: SyncSummary;
  records: RecordActionRow[];
  upcoming: UpcomingEventRow[];
  contributions: ContributionRow[];
  summary: ContributionSummaryRow | null;
  years: string[];
}) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [year, setYear] = useState("all");
  const yearId = useId();
  const role = officeRole(office);
  const inYear = (row: RecordActionRow) => year === "all" || row.acted_on.startsWith(year);
  const current = records.filter((row) => !row.office_context);
  const earlier = records.filter((row) => row.office_context);
  const shownRecords = current.filter(inYear);
  const shownEarlier = earlier.filter(inYear);
  const shownUpcoming =
    year === "all" ? upcoming : upcoming.filter((row) => !row.starts_on || row.starts_on.startsWith(year));
  const showYear = tab === "upcoming" || tab === "record";
  const votes = teasers.find((teaser) => teaser.id === "voting_record");
  const money = teasers.find((teaser) => teaser.id === "donations");
  const recordNote = officeRecordNote(office);

  const tabs: { id: Tab; label: string }[] = [
    { id: "upcoming", label: "Upcoming" },
    { id: "record", label: officeRecordTab(office) },
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
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {showYear && years.length > 0 ? (
            <Dropdown
              id={yearId}
              label="Year"
              inline
              value={year}
              onChange={setYear}
              options={[{ value: "all", label: "All years" }, ...years.map((value) => ({ value, label: value }))]}
            />
          ) : null}
        </div>
      </div>

      {tab === "upcoming" ? (
        upcoming.length === 0 ? (
          <NotLoaded
            lead={`${officeUpcoming(office)} for ${name} are not loaded yet.`}
            sources={`${capitalize(sourcesFor([office]).join("; "))}. Sync checks them every day.`}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {shownUpcoming.length === 0 ? (
              <p className="rounded-3xl border border-dashed px-5 py-8">Nothing scheduled for {year} yet.</p>
            ) : (
              <ul className="flex flex-col rounded-3xl border border-border bg-card">
                {shownUpcoming.map((event) => {
                  const cancelled = event.status === "cancelled";
                  return (
                    <li
                      key={event.id}
                      className="grid gap-x-5 gap-y-1 border-b border-border px-5 py-4 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)]"
                    >
                      <span className="flex flex-col">
                        <span className="font-extrabold">{formatLongDate(event.starts_on) ?? "Date not set"}</span>
                        <span className="text-sm text-muted-foreground">
                          {timeLabel({ startsAt: event.starts_at, kind: event.kind, date: event.starts_on ?? "", endDate: event.ends_on, legal: Boolean(event.legal_basis) })}
                        </span>
                      </span>
                      <span className="flex flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full border border-foreground/60 px-2 py-0.5 font-bold uppercase tracking-[0.06em]">
                            {event.is_campaign ? "Campaign event" : kindLabel(event.kind)}
                          </span>
                          {cancelled ? (
                            <span className="rounded-full bg-[var(--against-bg)] px-2 py-0.5 font-bold text-[var(--against-fg)]">Cancelled</span>
                          ) : null}
                        </span>
                        <Link
                          href={`/events/${event.id}`}
                          className={cn("inline-flex min-h-11 items-center self-start font-bold underline underline-offset-4", cancelled && "line-through")}
                        >
                          {event.title}
                        </Link>
                        <span className="text-sm text-muted-foreground">
                          {event.legal_basis ? `Computed from ${event.legal_basis}` : `Source: ${event.source_name}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-right text-sm">
              <Link href={`/events?official=${slug}`} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                See {name} on the Events calendar
              </Link>
            </p>
          </div>
        )
      ) : null}

      {tab === "record" ? (
        <div className="flex flex-col gap-6">
          {current.length === 0 ? (
            <NotLoaded
              lead={
                recordNote
                  ? `${recordNote} That record is not loaded yet.`
                  : "No roll-call votes or bills are on record yet. They load after the term starts. Each one is tied to a promise only when it really bears on it."
              }
              teaser={votes}
            />
          ) : shownRecords.length === 0 ? (
            <p className="rounded-3xl border border-dashed px-5 py-8">Nothing on the record for {year} yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {recordNote ? <p className="text-muted-foreground">{recordNote}</p> : null}
              <ul className="flex flex-col gap-3">
                {shownRecords.map((record) => (
                  <RecordItem key={record.id} record={record} role={role} />
                ))}
              </ul>
            </div>
          )}
          {shownEarlier.length > 0 ? <EarlierRecord records={shownEarlier} /> : null}
        </div>
      ) : null}

      {tab === "money" ? (
        !summary ? (
          <NotLoaded
            lead="Donations are not loaded yet. A donor is named only when a public filing proves the name and the amount."
            teaser={money}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-card px-5 py-4">
                <dt className="sr-only">Raised</dt>
                <dd className="flex flex-col gap-0.5">
                  <span className="text-3xl font-black">{formatMoney(summary.receipts)}</span>
                  <span className="text-sm font-semibold text-muted-foreground">raised in the {summary.cycle} cycle</span>
                </dd>
              </div>
              <div className="rounded-2xl border border-border bg-card px-5 py-4">
                <dt className="sr-only">Small donors</dt>
                <dd className="flex flex-col gap-0.5">
                  <span className="text-3xl font-black">{share(summary.individual_unitemized, summary.receipts)}</span>
                  <span className="text-sm font-semibold text-muted-foreground">from donors giving $200 or less</span>
                </dd>
              </div>
              <div className="rounded-2xl border border-border bg-card px-5 py-4">
                <dt className="sr-only">From Texas</dt>
                <dd className="flex flex-col gap-0.5">
                  <span className="text-3xl font-black">{share(summary.in_state_itemized, summary.state_itemized_total)}</span>
                  <span className="text-sm font-semibold text-muted-foreground">of itemized individual dollars from Texas</span>
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-4">
              <section aria-labelledby="top-donors" className="flex flex-[1_1_28rem] flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <h2 id="top-donors" className="text-lg font-extrabold">
                  Largest individual gifts
                </h2>
                {contributions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No itemized gifts are stored yet.</p>
                ) : (
                  <ol className="flex flex-col">
                    {contributions.slice(0, 10).map((gift) => (
                      <li key={gift.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-border py-2.5 last:border-b-0">
                        <span className="flex flex-col">
                          <span className="font-semibold">{gift.contributor_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {[gift.contributor_city, gift.contributor_state].filter(Boolean).join(", ")}
                            {gift.contributor_employer ? ` · ${gift.contributor_employer}` : ""}
                            {gift.contributed_on ? ` · ${formatLongDate(gift.contributed_on)}` : ""}
                          </span>
                        </span>
                        <span className="flex items-baseline gap-3">
                          <span className="font-extrabold">${formatNumber(gift.amount)}</span>
                          <a href={gift.source_url} className="text-xs font-semibold underline underline-offset-4">
                            Filing
                          </a>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
              <section aria-labelledby="top-employers" className="flex flex-[1_1_20rem] flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <h2 id="top-employers" className="text-lg font-extrabold">
                  Donors&apos; employers
                </h2>
                {summary.top_employers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not reported.</p>
                ) : (
                  <ol className="flex flex-col gap-2.5">
                    {summary.top_employers.map((row) => {
                      const top = summary.top_employers[0]?.total || 1;
                      return (
                        <li key={row.employer} className="flex flex-col gap-1">
                          <span className="flex justify-between gap-3 text-sm">
                            <span className="font-semibold">{row.employer}</span>
                            <span className="font-extrabold">{formatMoney(row.total)}</span>
                          </span>
                          <span className="h-2 rounded-full bg-secondary">
                            <span className="block h-2 rounded-full bg-foreground" style={{ width: `${Math.max(2, (row.total / top) * 100)}%` }} />
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </div>
            <p className="text-sm text-muted-foreground">
              Source:{" "}
              <a href={summary.source_url} className="font-semibold underline underline-offset-4">
                {summary.source_name}
              </a>
              {summary.coverage_end_date ? ` · Filings through ${formatLongDate(summary.coverage_end_date)}` : ""}. Each gift
              links to the filing that reports it.
            </p>
          </div>
        )
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
                One Sync covers every official at once. It checks the sources below for anything new, reads each
                official&apos;s campaign pages for every topic in the topic registry, and checks the bills each topic
                watches on Texas Legislature Online and in the House Journal. New records are saved with a link back to
                the original. Topic matches wait in a review queue: none becomes a promise until a person checks the
                exact quote and the source. Only official records and the officials&apos; own words are used, never news
                stories. Sync runs once a day for the whole site, and at 11:30 pm CT on its own if nobody pressed it that day.
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

      <div className="flex justify-end border-t border-border pt-4">
        <SyncButton lastSyncedAt={lastSyncedAt} summary={syncSummary} />
      </div>
    </div>
  );
}

function capitalize(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
