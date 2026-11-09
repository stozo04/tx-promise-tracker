import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";

import { LedgerLoading } from "@/components/ledger-loading";
import { congressBillUrl } from "@/lib/event-sources";
import { centralTime, kindLabel, longDay, monthTitle } from "@/lib/events";
import { formatTimestamp, officeLabel } from "@/lib/format";
import { loadLedger } from "@/lib/queries";
import { SITE_URL } from "@/lib/site";
import type { Ledger, UpcomingEventRow } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

/** With Cache Components a dynamic route must list at least one id; an unknown one is a 404. */
export async function generateStaticParams() {
  const ledger = await loadLedger();
  const ids = ledger.upcomingEvents.map((row) => ({ id: row.id }));
  return ids.length > 0 ? ids : [{ id: "none" }];
}

function eventRows(ledger: Ledger, id: string) {
  const row = ledger.upcomingEvents.find((event) => event.id === id);
  if (!row) return null;
  const key = row.event_key ?? row.external_id;
  const rows = ledger.upcomingEvents.filter((event) => (event.event_key ?? event.external_id) === key);
  return { row, rows };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const found = eventRows(await loadLedger(), id);
  if (!found) return { title: "Event not found" };
  const { row } = found;
  return {
    title: `${row.title}, ${row.starts_on ? longDay(row.starts_on) : ""}`.slice(0, 90),
    description: `${kindLabel(row.kind)} on ${row.starts_on ? longDay(row.starts_on) : "a date not set"}. Source: ${row.source_name}.`,
    alternates: { canonical: `${SITE_URL}/events/${row.id}` },
  };
}

/** The page returns at once and the event streams in under Suspense. */
export default function EventPage({ params }: Props) {
  return (
    <Suspense fallback={<LedgerLoading />}>
      <EventRecord params={params} />
    </Suspense>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

const STATUS_TEXT: Record<UpcomingEventRow["status"], string> = {
  scheduled: "Scheduled",
  changed: "Changed since it was first posted",
  cancelled: "Cancelled",
  held: "Held",
};

async function EventRecord({ params }: Props) {
  const { id } = await params;
  const ledger = await loadLedger();
  const found = eventRows(ledger, id);
  if (!found) notFound();
  const { row, rows } = found;
  const officials = ledger.politicians.filter((person) => rows.some((r) => r.politician_id === person.id));
  const cancelled = row.status === "cancelled";
  const when = row.starts_on ? longDay(row.starts_on) : "Date not given";
  const until = row.ends_on && row.ends_on !== row.starts_on ? ` through ${longDay(row.ends_on)}` : "";
  const time = row.starts_at ? `${centralTime(row.starts_at)} Central` : row.kind === "deadline" || row.legal_basis || until ? "All day" : "Time not given by the source";
  const shareUrl = `${SITE_URL}/events/${row.id}`;
  // Every bill the source names is listed; it links to Congress.gov when its type is known.
  const bills = row.bills.map((bill) => ({ bill, url: row.starts_on ? congressBillUrl(bill, row.starts_on) : null }));

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <p className="text-sm">
        <Link href="/events" className="text-bluebonnet underline">
          Events
        </Link>
        {row.starts_on ? (
          <>
            {" / "}
            <Link href={`/events?month=${row.starts_on.slice(0, 7)}`} className="text-bluebonnet underline">
              {monthTitle(row.starts_on.slice(0, 7))}
            </Link>
          </>
        ) : null}
      </p>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border-2 border-foreground px-2.5 py-0.5 font-extrabold">
            {row.is_campaign ? "Campaign event" : kindLabel(row.kind)}
          </span>
          {cancelled ? (
            <span className="rounded-full bg-[var(--against-bg)] px-2.5 py-1 font-bold text-[var(--against-fg)]">Cancelled</span>
          ) : null}
          {row.body ? <span className="text-sm text-muted-foreground">{row.body}</span> : null}
        </div>
        <h1 className={`text-3xl leading-snug text-ink sm:text-4xl ${cancelled ? "line-through decoration-2" : ""}`}>{row.title}</h1>
        <p className="text-lg">
          {when}
          {until} · {time}
        </p>
      </header>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Fact label={officials.length === 1 ? "Official" : "Officials"}>{officials.map((person) => person.name).join(", ")}</Fact>
        <Fact label="Kind">{row.is_campaign ? "Campaign event (from the campaign's own events page)" : kindLabel(row.kind)}</Fact>
        <Fact label="Date and time (Central)">
          {when}
          {until}, {time}
        </Fact>
        {row.location || !row.legal_basis ? <Fact label="Where">{row.location ?? "Not given by the source"}</Fact> : null}
        <Fact label="Held by">{row.body ?? "Not given by the source"}</Fact>
        <Fact label="Status">
          {STATUS_TEXT[row.status]}
          {row.updated_at ? ` · Last updated ${formatTimestamp(row.updated_at)}` : ""}
        </Fact>
      </dl>

      {row.details ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-2xl text-ink">Details</h2>
          <p className="leading-7">{row.details}</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl text-ink">Source</h2>
        {row.legal_basis ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
            <p className="font-semibold">Computed from {row.legal_basis}</p>
            {row.computed_from ? <p className="text-sm leading-6">{row.computed_from}</p> : null}
            {row.legal_url ? (
              <a href={row.legal_url} className="inline-flex min-h-11 items-center gap-1 self-start font-semibold text-bluebonnet underline">
                Read the law&apos;s text
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        ) : (
          <a href={row.source_url} className="inline-flex min-h-11 items-center gap-1 self-start font-semibold text-bluebonnet underline">
            {row.source_name}
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        )}
        <p className="text-sm text-muted-foreground">
          {row.legal_basis
            ? "No office has posted this date. It is computed only as the law states, and it is checked against the law's current text on every Sync."
            : "This is the page that announced the event. Times there may be in another time zone; this page shows Central time."}
        </p>
      </section>

      {bills.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-2xl text-ink">Bills named</h2>
          <ul className="flex flex-wrap gap-3">
            {bills.map((b) => (
              <li key={b.bill}>
                {b.url ? (
                  <a href={b.url} className="inline-flex min-h-11 items-center gap-1 font-semibold text-bluebonnet underline">
                    {b.bill}
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="inline-flex min-h-11 items-center font-semibold">{b.bill}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-2xl text-ink">Related</h2>
        <ul className="flex flex-col gap-1">
          {officials.map((person) => (
            <li key={person.id} className="flex flex-wrap items-center gap-x-4">
              <span className="text-sm text-muted-foreground">
                {person.name}, {officeLabel(person)}:
              </span>
              <Link href={`/politicians/${person.slug}`} className="inline-flex min-h-11 items-center font-semibold text-bluebonnet underline">
                Promise vs. Delivered
              </Link>
              <Link href={`/politicians/${person.slug}/nerds`} className="inline-flex min-h-11 items-center font-semibold text-bluebonnet underline">
                For the nerds
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="break-all text-sm text-muted-foreground">
        Link to this event: <span className="font-mono">{shareUrl}</span>
      </p>
    </article>
  );
}
