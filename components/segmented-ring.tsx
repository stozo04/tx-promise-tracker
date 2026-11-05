import { statusLabel } from "@/lib/format";
import { STATUSES } from "@/lib/types";

export function SegmentedRing({
  counts,
  label,
}: {
  counts: Record<string, number>;
  label: string;
}) {
  const size = 148;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const segments = STATUSES.map((status) => ({
    status,
    value: counts[status] ?? 0,
  })).filter((segment) => segment.value > 0);
  const gap = segments.length > 1 ? 3 : 0;
  const arcs = segments.reduce<{ status: string; length: number; offset: number }[]>(
    (items, segment) => {
      const used = items.reduce((sum, arc) => sum + arc.length + (segments.length > 1 ? gap : 0), 0);
      const raw = total === 0 ? 0 : (segment.value / total) * circumference;
      const length = Math.max(0, raw - gap);
      return [...items, { status: segment.status, length, offset: used }];
    },
    [],
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      className="shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--ring-track)"
        strokeWidth={stroke}
      />
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {arcs.map((arc) => (
          <circle
            key={arc.status}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`var(--status-${arc.status})`}
            strokeWidth={stroke}
            strokeDasharray={`${arc.length} ${circumference - arc.length}`}
            strokeDashoffset={-arc.offset}
          />
        ))}
      </g>
      <text
        x="50%"
        y="46%"
        textAnchor="middle"
        fill="var(--ink)"
        fontSize="28"
        fontWeight="700"
      >
        {total}
      </text>
      <text x="50%" y="62%" textAnchor="middle" fill="var(--ring-caption)" fontSize="11">
        {total === 1 ? "promise" : "promises"}
      </text>
      <title>
        {segments
          .map((segment) => `${statusLabel(segment.status)}: ${segment.value}`)
          .join(", ")}
      </title>
    </svg>
  );
}
