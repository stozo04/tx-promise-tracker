"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { functionUrl } from "@/lib/community";
import { cooldownRemaining, formatAgo, formatWait } from "@/lib/sync";
import { cn } from "@/lib/utils";

/**
 * Ask the server for a fresh pull from every source. The whole site gets one
 * sync per 24 hours. Inside that window the button explains how long to wait.
 */
export function SyncButton({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const [last, setLast] = useState(lastSyncedAt);
  const [now, setNow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  async function sync() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(functionUrl("tx_sync"), { method: "POST" });
      const body = (await response.json()) as { message?: string; last_synced_at?: string | null };
      if (body.last_synced_at) setLast(body.last_synced_at);
      setMessage(body.message ?? (response.ok ? "Sync started." : "Sync did not start."));
    } catch {
      setMessage("Could not reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
      setNow(Date.now());
    }
  }

  const remaining = now === null ? 0 : cooldownRemaining(last, now);
  const status =
    message ??
    (last && now !== null
      ? remaining > 0
        ? `Last synced ${formatAgo(last, now)}. Next sync in ${formatWait(remaining)}.`
        : `Last synced ${formatAgo(last, now)}.`
      : "Not synced yet.");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {status}
      </p>
      <button
        type="button"
        onClick={sync}
        disabled={busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background disabled:cursor-progress disabled:opacity-80"
      >
        <RefreshCw className={cn("size-4", busy && "animate-spin")} aria-hidden="true" />
        {busy ? "Syncing…" : "Sync"}
      </button>
    </div>
  );
}
