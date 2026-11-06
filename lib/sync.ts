/** One site-wide sync per day. Anyone can ask for one, but only once every 24 hours. */
export const SYNC_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function cooldownRemaining(lastSyncedAt: string | null, now: number) {
  if (!lastSyncedAt) return 0;
  const last = Date.parse(lastSyncedAt);
  if (Number.isNaN(last)) return 0;
  return Math.max(0, last + SYNC_COOLDOWN_MS - now);
}

/** "6h 12m", "45m", or "less than a minute". */
export function formatWait(ms: number) {
  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes <= 0) return "less than a minute";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** "3 hours ago", "12 minutes ago", "2 days ago". */
export function formatAgo(iso: string, now: number) {
  const diff = Math.max(0, now - Date.parse(iso));
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}
