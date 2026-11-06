import { Check, CircleDashed, Replace, RotateCcw } from "lucide-react";

import { directionLabel, type Direction } from "@/lib/delivered";
import { cn } from "@/lib/utils";

const STYLES: Record<Direction, string> = {
  match: "bg-[var(--match-bg)] text-[var(--match-fg)]",
  against: "bg-[var(--against-bg)] text-[var(--against-fg)]",
  partly: "bg-[var(--partly-bg)] text-[var(--partly-fg)]",
  neutral: "bg-secondary text-foreground",
};

const ICONS = {
  match: Check,
  against: RotateCcw,
  partly: CircleDashed,
  neutral: Replace,
} as const;

export function DirectionChip({ direction, className }: { direction: Direction; className?: string }) {
  const Icon = ICONS[direction];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
        STYLES[direction],
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {directionLabel(direction)}
    </span>
  );
}
