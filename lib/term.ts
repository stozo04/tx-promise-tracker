export type TermPhase = "before_term" | "in_office" | "unknown";

export type TermClock = {
  phase: TermPhase;
  asOf: string;
  daysUntilTerm: number | null;
  daysInOffice: number | null;
};

export function texasDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

export function termClock(termStart: string | null, now: Date): TermClock {
  const asOf = texasDate(now);
  if (!termStart) {
    return { phase: "unknown", asOf, daysUntilTerm: null, daysInOffice: null };
  }
  if (asOf < termStart) {
    return {
      phase: "before_term",
      asOf,
      daysUntilTerm: daysBetween(asOf, termStart),
      daysInOffice: null,
    };
  }
  return {
    phase: "in_office",
    asOf,
    daysUntilTerm: null,
    daysInOffice: daysBetween(termStart, asOf) + 1,
  };
}

/** UTC timestamp for midnight at the start of a calendar day in America/Chicago. */
export function chicagoMidnight(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const offsetAt = (instant: number) => {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
    );
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return asUtc - instant;
  };

  const localMidnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const guess = localMidnightAsUtc - offsetAt(Date.UTC(year, month - 1, day, 6, 0, 0));
  return localMidnightAsUtc - offsetAt(guess);
}
