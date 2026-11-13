import { message } from "./shared.ts";

export const STAGE_CALLS_PER_WINDOW = 25;
export const STAGE_CALL_WINDOW_MS = 60_000;
export const MAX_RATE_LIMIT_RETRIES = 3;
export const RATE_LIMIT_PAD_MS = 250;

export function slotWaitMs(starts: number[], now: number, limit = STAGE_CALLS_PER_WINDOW, windowMs = STAGE_CALL_WINDOW_MS) {
  const recent = starts.filter((at) => now - at < windowMs).sort((a, b) => a - b);
  if (recent.length < limit) return 0;
  return Math.max(0, recent[recent.length - limit] + windowMs - now);
}

export function rateLimitRetryMs(err: unknown): number | null {
  const retryAfter = (err as { retryAfterMs?: unknown } | null)?.retryAfterMs;
  if (typeof retryAfter === "number" && Number.isFinite(retryAfter)) return Math.max(0, retryAfter) + RATE_LIMIT_PAD_MS;
  const text = message(err);
  if (!/rate limit exceeded for trace/i.test(text)) return null;
  const match = /retry after (\d+)\s*ms/i.exec(text);
  return (match ? Number(match[1]) : 1_000) + RATE_LIMIT_PAD_MS;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
