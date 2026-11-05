"use client";

import { useEffect, useState } from "react";

import { formatLongDate } from "@/lib/format";
import { termClock } from "@/lib/term";

export function OathCountdown({
  name,
  termStart,
  asOf,
}: {
  name: string;
  termStart: string;
  asOf: string;
}) {
  const [nowIso, setNowIso] = useState(asOf);

  useEffect(() => {
    const tick = () => setNowIso(new Date().toISOString());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const now = new Date(nowIso);
  const clock = termClock(termStart, now);
  const dateLabel = formatLongDate(termStart);

  if (clock.phase === "in_office") {
    const day = clock.daysInOffice ?? 1;
    return (
      <p className="text-sm">
        <span className="font-heading text-3xl font-semibold text-ink">{day}</span>{" "}
        <span className="text-muted-foreground">
          {day === 1 ? "day" : "days"} in office for {name}, since {dateLabel}.
        </span>
      </p>
    );
  }

  const days = clock.daysUntilTerm ?? 0;
  return (
    <p className="text-sm">
      <span className="font-heading text-3xl font-semibold text-ink">{days}</span>{" "}
      <span className="text-muted-foreground">
        {days === 1 ? "day" : "days"} until {name} takes office on {dateLabel}.
      </span>
    </p>
  );
}
