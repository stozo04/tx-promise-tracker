"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { functionUrl } from "@/lib/community";
import { cooldownRemaining, formatAgo, formatWait, type SyncSummary } from "@/lib/sync";
import { cn } from "@/lib/utils";

export type { SyncSummary };

const SYNCED_AT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** What the last run did, and which findings are waiting for a person to review them. */
function LastRun({ summary }: { summary: SyncSummary }) {
  const { lastRun, officials } = summary;
  const waiting = officials.reduce((sum, row) => sum + row.topics.reduce((n, topic) => n + topic.awaiting, 0), 0);
  return (
    <details className="group w-full max-w-xl self-end rounded-2xl border border-border bg-card text-left text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 font-bold">
        <span>
          Last run results · {plural(waiting, "finding", "findings")} awaiting review
        </span>
        <span aria-hidden="true" className="text-muted-foreground group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
        {lastRun ? (
          <p className="leading-6 text-muted-foreground">
            {lastRun.finishedAt ? "Finished" : "Started"} {SYNCED_AT.format(new Date(lastRun.finishedAt ?? lastRun.startedAt))} CT
            {lastRun.triggeredBy === "schedule" ? ", started by the nightly schedule" : ""}.{" "}
            {lastRun.pagesChecked === null
              ? "That run did not check campaign pages for topics."
              : `${plural(lastRun.pagesChecked, "campaign page", "campaign pages")} checked, ${plural(lastRun.pagesChanged ?? 0, "page", "pages")} new or changed, ${plural(lastRun.billsChecked ?? 0, "watched bill", "watched bills")} checked.`}
            {lastRun.errors.length > 0 ? ` ${plural(lastRun.errors.length, "source", "sources")} failed and will be retried next time.` : " No source failed."}
          </p>
        ) : (
          <p className="text-muted-foreground">No sync has run yet.</p>
        )}
        {lastRun && lastRun.errors.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <h3 className="font-semibold">Failed sources</h3>
            <ul className="flex flex-col gap-1.5">
              {lastRun.errors.map((error, i) => (
                <li key={`${error.source}-${i}`} className="rounded-xl bg-[var(--partly-bg)] px-3 py-2 leading-6 text-[var(--partly-fg)]">
                  <span className="font-semibold">{error.source}</span>: <span className="break-words">{error.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {lastRun && lastRun.notes.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <h3 className="font-semibold">Run notes</h3>
            <ul className="flex list-disc flex-col gap-1 pl-5 leading-6 text-muted-foreground">
              {lastRun.notes.map((note, i) => (
                <li key={i} className="break-words">
                  {note}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="flex flex-col gap-2">
          {officials.map((official) => (
            <li key={official.slug} className="flex flex-col gap-0.5">
              <span className="font-semibold">{official.name}</span>
              <span className="text-muted-foreground">
                {official.topics
                  .map((topic) => `${topic.label}: ${topic.matched === null ? "not checked yet" : `${topic.matched} found last run`}, ${topic.awaiting} awaiting review`)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
        <p className="leading-6 text-muted-foreground">
          A finding is a keyword match on the official&apos;s own pages or a new action on a watched bill. It becomes a
          promise only after a person checks the exact quote and the primary source.
        </p>
      </div>
    </details>
  );
}

/**
 * Ask the server for a fresh pull from every source, for every official and every topic.
 * The whole site gets one sync per calendar day (Central time). If nobody starts it, the nightly job
 * runs it at 11:30 pm CT. After a run the button explains how long until the next day.
 */
export function SyncButton({ lastSyncedAt, summary }: { lastSyncedAt: string | null; summary?: SyncSummary }) {
  const [last, setLast] = useState(lastSyncedAt);
  const [now, setNow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  async function sync() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(functionUrl("tx_sync"), { method: "POST" });
      const body = (await response.json()) as { message?: string; last_synced_at?: string | null };
      if (body.last_synced_at) setLast(body.last_synced_at);
      setMessage(body.message ?? (response.ok ? "Sync started." : "Sync did not start."));
    } catch {
      setMessage("Could not reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
      setNow(Date.now());
    }
  }

  const remaining = now === null ? 0 : cooldownRemaining(last, now);
  const status =
    message ??
    (!last
      ? "Not synced yet."
      : now === null
        ? // Before the clock starts (server render, no JS), show the fixed time instead of "never".
          `Last synced ${SYNCED_AT.format(new Date(last))} CT.`
        : remaining > 0
          ? `Last synced ${formatAgo(last, now)}. Next sync in ${formatWait(remaining)}.`
          : `Last synced ${formatAgo(last, now)}.`);

  return (
    <div className="flex w-full flex-col items-end gap-3 text-right">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex flex-col items-end gap-0.5">
          <p aria-live="polite" className="text-sm font-semibold">
            {status}
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            Checks every official&apos;s sources and topics. Runs once a day for the whole site, at 11:30 pm CT if nobody starts it sooner.
          </p>
        </div>
        <button
          type="button"
          onClick={sync}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background disabled:cursor-progress disabled:opacity-80"
        >
          <RefreshCw className={cn("size-4", busy && "animate-spin")} aria-hidden="true" />
          {busy ? "Syncing…" : "Sync all officials"}
        </button>
      </div>
      {summary ? <LastRun summary={summary} /> : null}
    </div>
  );
}
