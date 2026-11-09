"use client";

import { useCallback, useId, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";

import { Dropdown } from "@/components/dropdown";
import {
  type CalendarEvent,
  centralToday,
  eventDays,
  KIND_LABELS,
  kindLabel,
  longDay,
  monthGrid,
  monthTitle,
  OFFICIAL_COLORS,
  shiftMonth,
  timeLabel,
  unloadedSources,
} from "@/lib/events";
import { cn } from "@/lib/utils";

export type CalendarPerson = { id: string; slug: string; name: string; office: string; color: number };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function lastName(name: string) {
  return name.split(" ").at(-1) ?? name;
}

function OfficialChips({ ids, people, compact = false }: { ids: string[]; people: CalendarPerson[]; compact?: boolean }) {
  const shown = people.filter((person) => ids.includes(person.id));
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {shown.map((person) => (
        <span key={person.id} className="inline-flex items-center gap-1 text-xs font-semibold" title={person.name}>
          <span className={cn("size-2.5 shrink-0 rounded-full", OFFICIAL_COLORS[person.color % OFFICIAL_COLORS.length])} aria-hidden="true" />
          {compact ? <span className="sr-only">{person.name}</span> : <span>{lastName(person.name)}</span>}
        </span>
      ))}
    </span>
  );
}

function KindTag({ event }: { event: CalendarEvent }) {
  return (
    <span className="rounded-full border border-foreground/60 px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-[0.06em]">
      {event.isCampaign ? "Campaign event" : kindLabel(event.kind)}
    </span>
  );
}

function Cancelled({ event }: { event: CalendarEvent }) {
  return event.status === "cancelled" ? (
    <span className="rounded-full bg-[var(--against-bg)] px-2 py-0.5 text-[0.7rem] font-bold text-[var(--against-fg)]">Cancelled</span>
  ) : null;
}

/** One event in the agenda list. */
function AgendaItem({ event, people }: { event: CalendarEvent; people: CalendarPerson[] }) {
  const cancelled = event.status === "cancelled";
  return (
    <li>
      <Link
        href={`/events/${event.id}`}
        className="grid min-h-11 gap-x-4 gap-y-1.5 rounded-2xl px-3 py-3 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:grid-cols-[7.5rem_minmax(0,1fr)]"
      >
        <span className="text-sm font-extrabold">{timeLabel(event)}</span>
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className={cn("font-bold leading-snug", cancelled && "line-through decoration-2")}>{event.title}</span>
          {event.body || event.location ? (
            <span className="text-sm text-muted-foreground">{[event.body, event.location].filter(Boolean).join(" · ")}</span>
          ) : null}
          <span className="flex flex-wrap items-center gap-2">
            <KindTag event={event} />
            <Cancelled event={event} />
            <OfficialChips ids={event.politicianIds} people={people} />
          </span>
        </span>
      </Link>
    </li>
  );
}

/** One event inside a month-grid cell. */
function CellItem({ event, people }: { event: CalendarEvent; people: CalendarPerson[] }) {
  const cancelled = event.status === "cancelled";
  return (
    <li>
      <Link
        href={`/events/${event.id}`}
        className="flex min-h-11 flex-col justify-center gap-0.5 rounded-lg border border-border bg-card px-2 py-1 text-left text-xs hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <span className="flex items-center justify-between gap-1">
          <span className="font-bold">{event.isCampaign ? "Campaign" : kindLabel(event.kind)}</span>
          <OfficialChips ids={event.politicianIds} people={people} compact />
        </span>
        <span className={cn("line-clamp-2 font-semibold leading-snug", cancelled && "line-through")}>
          {cancelled ? "Cancelled: " : ""}
          {event.title}
        </span>
        <span className="text-muted-foreground">{timeLabel(event)}</span>
      </Link>
    </li>
  );
}

export function EventsCalendar({
  events,
  people,
}: {
  events: CalendarEvent[];
  people: CalendarPerson[];
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const officialId = useId();
  const kindId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const today = centralToday();
  const officialSlug = sp.get("official") ?? "all";
  const official = people.find((person) => person.slug === officialSlug) ?? null;
  const kind = sp.get("kind") && sp.get("kind")! in KIND_LABELS ? sp.get("kind")! : "all";
  const month = /^\d{4}-\d{2}$/.test(sp.get("month") ?? "") ? sp.get("month")! : today.slice(0, 7);
  const view = sp.get("view") === "agenda" ? "agenda" : "month";

  // Filtering happens in the browser; the URL keeps the view shareable (same pattern as the promise explorer).
  const setParams = useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(sp.toString());
      for (const [key, value] of Object.entries(next)) {
        if (!value || value === "all") params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, sp],
  );

  // The jump button disappears once its month shows, so keyboard focus moves to the month's heading.
  const jumpTo = (date: string) => {
    setParams({ month: date.slice(0, 7) });
    window.setTimeout(() => headingRef.current?.focus(), 50);
  };

  const filtered = useMemo(
    () =>
      events.filter(
        (event) => (!official || event.politicianIds.includes(official.id)) && (kind === "all" || event.kind === kind),
      ),
    [events, kind, official],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of filtered) for (const day of eventDays(event)) map.set(day, [...(map.get(day) ?? []), event]);
    return map;
  }, [filtered]);

  const inMonth = filtered.filter((event) => eventDays(event).some((day) => day.startsWith(month)));
  const agendaDays = [...new Set(inMonth.flatMap((event) => eventDays(event).filter((day) => day.startsWith(month))))].sort();
  const nextEvent = filtered.find((event) => event.date > `${month}-31`);
  const prevEvent = [...filtered].reverse().find((event) => event.date < `${month}-01`);
  const offices = official ? [official.office] : [...new Set(people.map((person) => person.office))];
  // Sources with none of their own events for what is shown: "not loaded yet", not just quiet this month.
  const missing = unloadedSources(offices, kind, filtered);
  const who = official ? official.name : "any official";

  const navButton =
    "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border-2 border-border px-3 text-sm font-bold hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <Dropdown
          id={officialId}
          label="Official"
          value={official ? official.slug : "all"}
          onChange={(value) => setParams({ official: value })}
          options={[{ value: "all", label: "All officials" }, ...people.map((person) => ({ value: person.slug, label: person.name }))]}
        />
        <Dropdown
          id={kindId}
          label="Kind of event"
          value={kind}
          onChange={(value) => setParams({ kind: value })}
          options={[{ value: "all", label: "All events" }, ...Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))]}
        />
        <div role="group" aria-label="View" className="ml-auto hidden gap-1 rounded-xl bg-secondary p-1 sm:flex">
          {(["month", "agenda"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setParams({ view: option === "month" ? null : option })}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                view === option ? "bg-foreground text-background" : "hover:bg-card",
              )}
            >
              {option === "month" ? <CalendarDays className="size-4" aria-hidden="true" /> : <List className="size-4" aria-hidden="true" />}
              {option === "month" ? "Month" : "Agenda"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h2 ref={headingRef} tabIndex={-1} className="mr-auto text-2xl text-ink outline-none" aria-live="polite">
          {monthTitle(month)}
        </h2>
        <button type="button" className={navButton} onClick={() => setParams({ month: shiftMonth(month, -1) })} aria-label={`Previous month, ${monthTitle(shiftMonth(month, -1))}`}>
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <button type="button" className={navButton} onClick={() => setParams({ month: null })} disabled={month === today.slice(0, 7)}>
          Today
        </button>
        <button type="button" className={navButton} onClick={() => setParams({ month: shiftMonth(month, 1) })} aria-label={`Next month, ${monthTitle(shiftMonth(month, 1))}`}>
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">Times are Central.</p>

      {inMonth.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-3xl border border-dashed border-mesquite/40 bg-card/80 p-6">
          <p className="text-lg leading-7">
            Nothing is on the calendar for {who} in {monthTitle(month)}
            {kind === "all" ? "" : ` under ${kindLabel(kind).toLowerCase()}`}.
          </p>
          {missing.length > 0 ? (
            <p className="leading-7">
              <span className="mr-2 inline-flex rounded-full bg-limestone px-2.5 py-1 text-xs font-semibold text-ink">Not loaded yet</span>
              {capitalize(missing.join("; "))}. Sync checks these every day and adds events as the sources post them.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {prevEvent ? (
              <button type="button" className={navButton} onClick={() => jumpTo(prevEvent.date)}>
                <ChevronLeft className="size-4" aria-hidden="true" />
                Previous event: {longDay(prevEvent.date)}
              </button>
            ) : null}
            {nextEvent ? (
              <button type="button" className={navButton} onClick={() => jumpTo(nextEvent.date)}>
                Next event: {longDay(nextEvent.date)}
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {/* The month grid: wide screens only, unless the agenda is chosen. */}
          <div className={cn("hidden", view === "month" && "sm:block")}>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground" aria-hidden="true">
              {WEEKDAYS.map((day) => (
                <span key={day} className="py-1">
                  {day}
                </span>
              ))}
            </div>
            <ol className="grid grid-cols-7 gap-1" aria-label={`Days of ${monthTitle(month)}`}>
              {monthGrid(month).map((day) => {
                const items = byDay.get(day) ?? [];
                const outside = !day.startsWith(month);
                return (
                  <li
                    key={day}
                    aria-label={`${longDay(day)}${items.length ? `, ${items.length} ${items.length === 1 ? "event" : "events"}` : ""}`}
                    className={cn(
                      "flex min-h-28 flex-col gap-1 rounded-xl border border-border p-1.5",
                      outside ? "bg-transparent opacity-60" : "bg-card/70",
                      day === today && "border-2 border-foreground",
                    )}
                  >
                    <span className={cn("px-1 text-sm font-extrabold", day === today && "underline decoration-2 underline-offset-4")} aria-hidden="true">
                      {Number(day.slice(8))}
                    </span>
                    {items.length > 0 ? (
                      <ul className="flex flex-col gap-1">
                        {items.map((event) => (
                          <CellItem key={`${event.key}:${day}`} event={event} people={people} />
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>

          {/* The agenda: always on narrow screens, and on wide screens when chosen. */}
          <ol className={cn("flex flex-col gap-4", view === "month" && "sm:hidden")} aria-label={`Agenda for ${monthTitle(month)}`}>
            {agendaDays.map((day) => (
              <li key={day} className="flex flex-col gap-1">
                <h3 className={cn("border-b border-border pb-1.5 text-base font-extrabold", day === today && "underline decoration-2 underline-offset-4")}>
                  {longDay(day)}
                  {day === today ? " (today)" : ""}
                </h3>
                <ul className="flex flex-col">
                  {(byDay.get(day) ?? []).map((event) => (
                    <AgendaItem key={`${event.key}:${day}`} event={event} people={people} />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}

      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Officials">
        {people.map((person) => (
          <li key={person.id} className="inline-flex items-center gap-1.5">
            <span className={cn("size-3 rounded-full", OFFICIAL_COLORS[person.color % OFFICIAL_COLORS.length])} aria-hidden="true" />
            {person.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function capitalize(text: string) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
