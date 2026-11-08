"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * Hides extra rows behind a button that sits after the list, so
 * "Show fewer" is at the bottom of what you just read, not the middle.
 * Collapsing scrolls the button back into view so you don't lose your place.
 */
export function ShowMore({
  total,
  noun = "pledges",
  children,
}: {
  total: number;
  noun?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) {
      requestAnimationFrame(() => buttonRef.current?.scrollIntoView({ block: "nearest" }));
    }
  }

  return (
    <>
      {open ? children : null}
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="mt-3 inline-flex min-h-11 items-center self-end rounded-xl border-2 border-border px-4 text-sm font-bold hover:bg-secondary"
      >
        {open ? "Show fewer" : `Show all ${total} ${noun}`}
      </button>
    </>
  );
}
