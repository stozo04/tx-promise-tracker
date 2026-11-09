import type { Metadata } from "next";
import { Suspense } from "react";

import { EventsCalendar, type CalendarPerson } from "@/components/events-calendar";
import { LedgerLoading } from "@/components/ledger-loading";
import { EVENT_SOURCE_NAMES, groupEvents } from "@/lib/events";
import { formatTimestamp } from "@/lib/format";
import { loadLedger } from "@/lib/queries";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Events",
  description:
    "Upcoming session days, floor calendars, committee hearings, legal deadlines and public appearances for every tracked official, each linked to the primary source that announced it.",
  alternates: { canonical: `${SITE_URL}/events` },
};

/** The page returns at once and the calendar streams in under Suspense. */
export default function EventsPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl text-ink sm:text-5xl">Events</h1>
        <p className="max-w-3xl text-lg leading-8">
          Session days, floor calendars, committee hearings, deadlines set by law, and public appearances for every
          official tracked here. Each event links to the official page or law that announced it. Nothing is shown until
          a primary source lists it.
        </p>
      </header>
      <Suspense fallback={<LedgerLoading />}>
        <Calendar />
      </Suspense>
    </div>
  );
}

async function Calendar() {
  const ledger = await loadLedger();
  const people: CalendarPerson[] = ledger.politicians.map((person, index) => ({
    id: person.id,
    slug: person.slug,
    name: person.name,
    office: person.office,
    color: index,
  }));
  const events = groupEvents(ledger.upcomingEvents);
  const lastSyncedAt = ledger.ingestRuns.reduce<string | null>(
    (latest, run) => (latest === null || run.started_at > latest ? run.started_at : latest),
    null,
  );
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<p role="status">Loading the calendar…</p>}>
        <EventsCalendar events={events} people={people} />
      </Suspense>
      <p className="border-t border-border pt-4 text-right text-sm text-muted-foreground">
        Sources: {EVENT_SOURCE_NAMES.join(", ")}. Last Sync: {lastSyncedAt ? formatTimestamp(lastSyncedAt) : "not run yet"}.
      </p>
    </div>
  );
}
