import { statusHelp, statusLabel } from "@/lib/format";
import { STATUSES } from "@/lib/types";
import { cn } from "@/lib/utils";

const KNOWN = new Set<string>(STATUSES);

export function StatusPill({ status }: { status: string }) {
  const known = KNOWN.has(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        known ? "" : "bg-secondary text-foreground",
      )}
      style={
        known
          ? {
              backgroundColor: `var(--status-${status})`,
              color: `var(--status-${status}-fg)`,
            }
          : undefined
      }
      title={statusHelp(status)}
    >
      {statusLabel(status)}
    </span>
  );
}
