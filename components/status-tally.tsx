import { scoredShare, statusHelp, statusLabel } from "@/lib/format";
import { STATUSES } from "@/lib/types";

export function StatusTally({ counts }: { counts: Record<string, number> }) {
  const share = scoredShare(counts);
  const visible = STATUSES.filter((status) => status !== "unverified" || counts[status] > 0);

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {visible.map((status) => (
          <div
            key={status}
            className={counts[status] ? "rounded-2xl bg-secondary px-3 py-2" : "rounded-2xl px-3 py-2 opacity-60"}
            title={statusHelp(status)}
          >
            <dt className="text-xs text-muted-foreground">{statusLabel(status)}</dt>
            <dd className="font-heading text-2xl text-ink">{counts[status] ?? 0}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">
        {share.percent}% scored. Pending, unverified, and in progress stay open until evidence says otherwise.
      </p>
    </div>
  );
}

export function StatusBar({
  counts,
  label,
}: {
  counts: Record<string, number>;
  label: string;
}) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0) || 1;

  return (
    <div
      className="flex h-3 overflow-hidden rounded-full"
      style={{ backgroundColor: "var(--ring-track)" }}
      role="img"
      aria-label={label}
    >
      {STATUSES.filter((status) => (counts[status] ?? 0) > 0).map((status) => (
        <div
          key={status}
          style={{
            width: `${((counts[status] ?? 0) / total) * 100}%`,
            backgroundColor: `var(--status-${status})`,
          }}
        />
      ))}
    </div>
  );
}
