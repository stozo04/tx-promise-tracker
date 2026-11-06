"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { CommunityVote } from "@/components/community-vote";
import { DirectionChip } from "@/components/direction-chip";
import { Dropdown } from "@/components/dropdown";
import { StatusPill } from "@/components/status-pill";
import type { DeliveredPromise } from "@/lib/delivered";
import { formatLongDate, topicLabel } from "@/lib/format";

/**
 * "What they said. What they did." One pair of cards per promise that has
 * evidence on record. Promises with no evidence are left out here; they still
 * show in the at-a-glance chart and in the full promise list.
 */
export function SaidDid({
  promises,
  years,
  emptyNote,
  role,
}: {
  promises: DeliveredPromise[];
  years: string[];
  emptyNote: string;
  role: string;
}) {
  const [year, setYear] = useState("all");

  // The at-a-glance squares link to #action-{id}. If a year filter is hiding that action,
  // clear the filter and then scroll to it, so the proof link never goes nowhere.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const link = (event.target as Element | null)?.closest?.('a[href^="#action-"]');
      if (!link) return;
      const id = link.getAttribute("href")!.slice(1);
      if (document.getElementById(id)) return;
      setYear("all");
      window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "center" }), 0);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  const selectId = useId();

  const shown = promises
    .map((promise) => ({
      ...promise,
      actions: year === "all" ? promise.actions : promise.actions.filter((action) => action.year === year),
    }))
    .filter((promise) => promise.actions.length > 0);

  const hasAny = promises.some((promise) => promise.actions.length > 0);

  return (
    <section id="said-did" aria-labelledby="said-did-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 id="said-did-heading" className="text-3xl text-ink sm:text-4xl">
            What they said. What they did.
          </h2>
          <p className="max-w-2xl text-lg leading-7 text-muted-foreground">
            Every promise links to where it was said. Every action links to the public record.
          </p>
        </div>
        {years.length > 0 ? (
          <Dropdown
            id={selectId}
            label="Year"
            inline
            value={year}
            onChange={setYear}
            options={[{ value: "all", label: "All years" }, ...years.map((value) => ({ value, label: value }))]}
          />
        ) : null}
      </div>

      {!hasAny ? (
        <p className="rounded-3xl border border-dashed border-border px-6 py-8 text-lg leading-7">{emptyNote}</p>
      ) : shown.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-border px-6 py-8 text-lg leading-7">
          Nothing on the public record for {year} yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-8">
          {shown.map((promise) => (
            <li key={promise.id} id={`pledge-${promise.id}`} className="flex flex-wrap items-stretch gap-4">
              <article className="flex flex-[1_1_22rem] flex-col gap-3.5 rounded-3xl border border-[var(--said-border)] bg-[var(--said-bg)] p-6">
                <p className="border-b border-[var(--said-border)] pb-3 text-xs font-extrabold uppercase tracking-[0.1em]">
                  Said · {topicLabel(promise.topic)}
                </p>
                <blockquote className="line-clamp-6 font-heading text-xl leading-snug font-semibold sm:text-2xl">
                  “{promise.quote}”
                </blockquote>
                <p className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
                  <a href={promise.sourceUrl} className="inline-flex items-center gap-1 underline underline-offset-4">
                    {promise.sourceHost}
                    {promise.dateSaid ? `, ${formatLongDate(promise.dateSaid)}` : ""}
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                  <Link href={`/promises/${promise.id}`} className="underline underline-offset-4">
                    Full promise page
                  </Link>
                </p>
              </article>

              <article className="flex flex-[1_1_26rem] flex-col gap-3.5 rounded-3xl border border-[var(--did-border)] bg-[var(--did-bg)] p-6">
                <p className="border-b border-[var(--did-border)] pb-3 text-xs font-extrabold uppercase tracking-[0.1em]">
                  Did · {promise.actions.length} {promise.actions.length === 1 ? "action" : "actions"}
                </p>
                <ol className="flex flex-col">
                  {promise.actions.map((action, index) => (
                    <li
                      key={action.id}
                      id={`action-${action.id}`}
                      className={
                        index === 0
                          ? "flex flex-col gap-1.5 pb-1"
                          : "flex flex-col gap-1.5 border-t border-[var(--did-border)] pb-1 pt-3.5"
                      }
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill status={action.status} />
                        <DirectionChip direction={action.direction} />
                        <span className="text-sm font-semibold">{formatLongDate(action.decidedAt)}</span>
                      </div>
                      <p className="text-base font-bold leading-snug">
                        {action.note ?? "Evidence recorded without a note."}
                      </p>
                      {action.evidenceUrl ? (
                        <a
                          href={action.evidenceUrl}
                          className="inline-flex items-center gap-1 self-start text-sm font-semibold underline underline-offset-4"
                        >
                          {action.evidenceHost}
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                        </a>
                      ) : null}
                      <CommunityVote
                        itemType="status_update"
                        itemId={action.id}
                        question="Do you support this?"
                        stanceText={`The ${role} did this`}
                        officialStance="support"
                        role={role}
                      />
                    </li>
                  ))}
                </ol>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
