"use client";

import { useState } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ArchiveCard } from "@/lib/types";

export function ArchiveGallery({ items }: { items: ArchiveCard[] }) {
  const names = [...new Map(items.map((item) => [item.politicianSlug, item.politicianName])).entries()];
  const [who, setWho] = useState("all");
  const [selected, setSelected] = useState<ArchiveCard | null>(null);
  const shown = who === "all" ? items : items.filter((item) => item.politicianSlug === who);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter archives by person">
        <Button
          type="button"
          size="lg"
          variant={who === "all" ? "default" : "outline"}
          aria-pressed={who === "all"}
          className="h-9 rounded-full"
          onClick={() => setWho("all")}
        >
          Everyone
        </Button>
        {names.map(([slug, name]) => (
          <Button
            key={slug}
            type="button"
            size="lg"
            variant={who === slug ? "default" : "outline"}
            aria-pressed={who === slug}
            className="h-9 rounded-full"
            onClick={() => setWho(slug)}
          >
            {name}
          </Button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="rounded-3xl border border-dashed px-5 py-8 text-center">No screenshots in this set.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {shown.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelected(item)}
                className="w-full overflow-hidden rounded-3xl border border-border bg-card text-left shadow-[0_18px_40px_-32px_rgba(28,36,48,0.8)]"
              >
                <span className="relative block aspect-[16/10] bg-limestone">
                  <Image
                    src={item.screenshotUrl}
                    alt=""
                    fill
                    unoptimized
                    sizes="(min-width: 768px) 40vw, 100vw"
                    className="object-cover object-top"
                  />
                </span>
                <span className="block space-y-1 p-4">
                  <span className="block text-xs font-semibold text-bluebonnet">{item.politicianName}</span>
                  <span className="block font-heading text-lg leading-snug text-ink">{item.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    Saved {item.capturedLabel}
                    {item.promiseCount > 0
                      ? ` · ${item.promiseCount} ${item.promiseCount === 1 ? "promise" : "promises"} cite this page`
                      : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>{selected.title}</DialogTitle>
                <DialogDescription>
                  {selected.politicianName}. Archived {selected.capturedLabel}.
                  {selected.captureMethod ? ` Saved with ${selected.captureMethod}.` : ""}
                </DialogDescription>
              </DialogHeader>
              <Image
                src={selected.screenshotUrl}
                alt={`Archived screenshot of ${selected.title}`}
                width={1600}
                height={1000}
                unoptimized
                className="h-auto w-full rounded-xl border border-border"
              />
              <div className="flex flex-wrap gap-3 text-sm">
                <a className="font-semibold text-bluebonnet underline" href={selected.pageUrl}>
                  Original page
                </a>
                {selected.waybackUrl ? (
                  <a className="font-semibold text-bluebonnet underline" href={selected.waybackUrl}>
                    Internet Archive copy
                  </a>
                ) : null}
                {selected.htmlUrl ? (
                  <a className="font-semibold text-bluebonnet underline" href={selected.htmlUrl}>
                    Saved HTML
                  </a>
                ) : null}
                <a
                  className="font-semibold text-bluebonnet underline"
                  href={`/politicians/${selected.politicianSlug}?source=${encodeURIComponent(selected.pageUrl)}`}
                >
                  Promises from this page
                </a>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
