"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { PromiseCard } from "@/components/promise-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dropdown } from "@/components/dropdown";
import { filterPromises } from "@/lib/filters";
import { topicLabel } from "@/lib/format";
import { PROMISE_TYPES, STATUSES, type PromiseRow } from "@/lib/types";

export function PromiseExplorer({
  promises,
  topics,
}: {
  promises: PromiseRow[];
  topics: string[];
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const status = sp.get("status") ?? "all";
  const topic = sp.get("topic") ?? "all";
  const type = sp.get("type") ?? "all";
  const source = sp.get("source") ?? "";
  const qParam = sp.get("q") ?? "";
  const [draft, setDraft] = useState(qParam);
  const [syncedQuery, setSyncedQuery] = useState(qParam);
  if (qParam !== syncedQuery) {
    setSyncedQuery(qParam);
    setDraft(qParam);
  }

  // Filtering happens in the browser, so the URL is updated with the History API instead of
  // router.replace. That keeps every keystroke from re-rendering the page on the server.
  // Next.js keeps useSearchParams in sync with replaceState.
  const setUrl = useCallback((qs: string) => {
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }, [pathname]);

  useEffect(() => {
    if (draft === qParam) return;
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      const trimmed = draft.trim();
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      setUrl(params.toString());
    }, 250);
    return () => window.clearTimeout(handle);
  }, [draft, qParam, setUrl, sp]);

  function replace(next: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    setUrl(params.toString());
  }

  const result = useMemo(
    () =>
      filterPromises(promises, [], {
        status: status === "all" ? null : status,
        topic: topic === "all" ? null : topic,
        type: type === "all" ? null : type,
        q: draft,
        source: source || null,
      }),
    [draft, promises, source, status, topic, type],
  );

  const groups = useMemo(() => {
    const map = new Map<string, PromiseRow[]>();
    for (const promise of result.promises) {
      const key = promise.topic ?? "unspecified";
      const list = map.get(key) ?? [];
      list.push(promise);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([key, rows]) => {
        const sorted = [...rows].sort((a, b) => {
          if (a.promise_type === b.promise_type) return 0;
          return a.promise_type === "explicit_pledge" ? -1 : 1;
        });
        return [key, sorted] as const;
      })
      .sort((a, b) => b[1].length - a[1].length || topicLabel(a[0]).localeCompare(topicLabel(b[0])));
  }, [result.promises]);

  const filtersOn = status !== "all" || topic !== "all" || type !== "all" || source || qParam || draft;

  return (
    <div className="space-y-6">
      <form
        role="search"
        className="sticky top-16 z-20 space-y-3 rounded-3xl border border-border bg-paper/95 p-4 shadow-sm backdrop-blur"
        onSubmit={(event) => {
          event.preventDefault();
          replace({ q: draft.trim() });
        }}
      >
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="flex-1">
            <label htmlFor="promise-search" className="mb-1 block text-sm font-medium">
              Search promises
            </label>
            <Input
              id="promise-search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Try schools, refund, or veto"
              className="h-10 bg-card"
            />
          </div>
          <Dropdown
            id="status-filter"
            label="Status"
            sort={false}
            labelClassName="font-medium"
            value={status}
            onChange={(next) => replace({ status: next })}
            options={[
              { value: "all", label: "All statuses" },
              ...STATUSES.map((item) => ({ value: item, label: item.replaceAll("_", " ") })),
            ]}
          />
          <Dropdown
            id="topic-filter"
            label="Topic"
            labelClassName="font-medium"
            value={topic}
            onChange={(next) => replace({ topic: next })}
            options={[
              { value: "all", label: "All topics" },
              ...topics.map((item) => ({ value: item, label: topicLabel(item) })),
            ]}
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Pledge or platform</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "All"],
                ...PROMISE_TYPES.map((item) => [item, item === "explicit_pledge" ? "Explicit pledge" : "Platform"]),
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="lg"
                variant={type === value ? "default" : "outline"}
                aria-pressed={type === value}
                className="h-9 rounded-full"
                onClick={() => replace({ type: value })}
              >
                {label}
              </Button>
            ))}
            {filtersOn ? (
              <Button
                type="button"
                variant="ghost"
                className="h-9"
                onClick={() => {
                  setDraft("");
                  setUrl("");
                }}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        </fieldset>
      </form>

      {source ? (
        <p className="rounded-2xl bg-secondary px-4 py-3 text-sm">
          Showing promises whose source is this page.{" "}
          <button type="button" className="font-semibold underline" onClick={() => replace({ source: "" })}>
            Show every promise
          </button>
        </p>
      ) : null}

      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {result.error
          ? result.error.message
          : `Showing ${result.promises.length} of ${promises.length}.`}
      </p>

      {result.error ? null : groups.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-border bg-card px-5 py-8 text-center">
          {promises.length === 0
            ? "No promises are on record yet. Each one appears here with a verbatim quote and its source once it is added."
            : "Nothing matches. Clear a filter, or try a shorter search."}
        </p>
      ) : (
        groups.map(([key, rows]) => (
          <section key={key} aria-labelledby={`topic-${key}`} className="space-y-3">
            <h2 id={`topic-${key}`} className="text-2xl text-ink">
              {topicLabel(key)}{" "}
              <span className="text-base font-sans font-medium text-muted-foreground">
                {rows.length}
              </span>
            </h2>
            <div className="grid gap-3">
              {rows.map((promise) => (
                <PromiseCard key={promise.id} promise={promise} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
