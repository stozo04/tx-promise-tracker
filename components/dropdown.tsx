"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select } from "@base-ui/react/select";

import { cn } from "@/lib/utils";

export type DropdownOption = { value: string; label: string };

const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "vs"]);

/** "corruption and democracy" -> "Corruption and Democracy". Keeps acronyms like "AI" as written. */
export function titleCase(text: string) {
  return text
    .split(" ")
    .map((word, index) => {
      if (!word) return word;
      const lower = word.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) return lower;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** "All …" stays first; everything else A to Z (numbers in numeric order). */
function arrange(options: DropdownOption[], sort: boolean) {
  const shaped = options.map((option) => ({ ...option, label: titleCase(option.label) }));
  const pinned = shaped.filter((option) => option.value === "all");
  const others = shaped.filter((option) => option.value !== "all");
  const rest = sort
    ? others.sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true, sensitivity: "base" }))
    : others;
  return [...pinned, ...rest];
}

/**
 * The site's dropdown: a styled, keyboard-accessible listbox (Base UI Select)
 * instead of the browser's built-in menu, so it looks the same everywhere,
 * in light and dark mode.
 */
export function Dropdown({
  id,
  label,
  value,
  onChange,
  options,
  className,
  labelClassName,
  inline = false,
  sort = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  className?: string;
  labelClassName?: string;
  /** Label beside the button instead of above it. */
  inline?: boolean;
  /** Sort options A to Z (the default). Pass false to keep the given order, e.g. the status lifecycle. */
  sort?: boolean;
}) {
  const labelId = `${id}-label`;
  const items = arrange(options, sort);
  return (
    <div className={cn(inline ? "flex items-center gap-2.5" : "flex flex-col gap-1", className)}>
      <span id={labelId} className={cn("text-sm font-bold", labelClassName)}>
        {label}
      </span>
      <Select.Root
        items={items}
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(next);
        }}
      >
        <Select.Trigger
          id={id}
          aria-labelledby={`${labelId} ${id}`}
          className="group inline-flex min-h-11 min-w-36 max-w-full items-center justify-between gap-3 rounded-xl border-2 border-foreground bg-card px-3.5 text-left text-sm font-bold outline-none transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-secondary"
        >
          <Select.Value className="truncate" />
          <Select.Icon className="flex">
            <ChevronDown
              className="size-4 shrink-0 transition-transform duration-150 group-data-popup-open:rotate-180"
              aria-hidden="true"
            />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner sideOffset={6} align="start" alignItemWithTrigger={false} className="z-50 outline-none">
            <Select.Popup className="max-h-[min(22rem,var(--available-height))] min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-2xl border border-border bg-card p-1.5 text-foreground shadow-xl outline-none transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
              <Select.List>
                {items.map((option) => (
                  <Select.Item
                    key={option.value}
                    value={option.value}
                    className="flex min-h-10 cursor-default select-none items-center justify-between gap-6 rounded-xl px-3 text-sm font-semibold outline-none data-highlighted:bg-secondary data-selected:font-extrabold"
                  >
                    <Select.ItemText>{option.label}</Select.ItemText>
                    <Select.ItemIndicator className="flex">
                      <Check className="size-4" aria-hidden="true" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
