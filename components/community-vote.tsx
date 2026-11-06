"use client";

import { useEffect, useState } from "react";

import { functionUrl, type Choice, type VoteItemType } from "@/lib/community";
import { cn } from "@/lib/utils";

type State = { yourVote: Choice | null; support: number; oppose: number };

/**
 * "How would you vote?" One vote per IP address per item, enforced by the
 * tx_community_vote Edge Function. Results stay hidden until you vote, so
 * other visitors do not sway you.
 */
export function CommunityVote({
  itemType,
  itemId,
  question,
  stanceText,
  officialStance,
  role,
  compact = false,
}: {
  itemType: VoteItemType;
  itemId: string;
  question: string;
  stanceText: string;
  officialStance: Choice | null;
  role: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`${functionUrl("tx_community_vote")}?items=${itemType}:${itemId}`)
      .then((response) => response.json())
      .then((body: { items?: Record<string, { your_vote: Choice | null; support: number; oppose: number }> }) => {
        const item = body.items?.[`${itemType}:${itemId}`];
        if (live && item) setState({ yourVote: item.your_vote, support: item.support, oppose: item.oppose });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [itemType, itemId]);

  async function vote(choice: Choice) {
    if (busy || state?.yourVote) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(functionUrl("tx_community_vote"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_type: itemType, item_id: itemId, choice }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        message?: string;
        error?: string;
        your_vote?: Choice | null;
        support?: number;
        oppose?: number;
      };
      if (typeof body.support === "number") {
        setState({ yourVote: body.your_vote ?? null, support: body.support, oppose: body.oppose ?? 0 });
      }
      if (!body.ok) setMessage(body.message ?? body.error ?? "Your vote was not counted.");
    } catch {
      setMessage("Could not reach the server. Your vote was not counted.");
    } finally {
      setBusy(false);
    }
  }

  const voted = Boolean(state?.yourVote);
  const total = (state?.support ?? 0) + (state?.oppose ?? 0);
  const supportPct = total ? Math.round(((state?.support ?? 0) / total) * 100) : 0;
  const opposePct = total ? 100 - supportPct : 0;
  const majority = supportPct >= 55 ? "support" : supportPct <= 45 ? "oppose" : "split";

  let verdict = "";
  if (voted && total > 0) {
    if (majority === "split") verdict = "Visitors are split on this one.";
    else if (officialStance) {
      verdict =
        majority === officialStance
          ? `The ${role} acted with most visitors.`
          : `The ${role} acted against most visitors.`;
    } else {
      verdict = majority === "support" ? "Most visitors support this." : "Most visitors oppose this.";
    }
    if (officialStance && state?.yourVote) {
      verdict += state.yourVote === officialStance ? ` You agree with the ${role}.` : ` You disagree with the ${role}.`;
    }
  }

  const button = (choice: Choice, label: string) => (
    <button
      type="button"
      onClick={() => vote(choice)}
      disabled={busy || voted}
      aria-pressed={state?.yourVote === choice}
      className={cn(
        "min-h-10 rounded-lg border-2 px-3.5 text-sm font-extrabold disabled:cursor-default",
        state?.yourVote === choice
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-transparent hover:bg-secondary disabled:opacity-60",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className={cn("flex flex-col gap-2.5 rounded-xl bg-card", compact ? "p-2.5" : "mt-1.5 p-3.5")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-extrabold">
          {question} <span className="font-semibold text-muted-foreground">· {stanceText}</span>
        </p>
        <div role="group" aria-label="Your vote" className="flex gap-1.5">
          {button("support", "Support")}
          {button("oppose", "Oppose")}
        </div>
      </div>
      <div aria-live="polite" className="flex flex-col gap-1.5">
        {voted ? (
          <>
            <div
              role="img"
              aria-label={`${supportPct} percent support, ${opposePct} percent oppose`}
              className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
            >
              <span className="bg-foreground" style={{ flex: supportPct || 0.0001 }} />
              <span className="bg-muted-foreground/50" style={{ flex: opposePct || 0.0001 }} />
            </div>
            <div className="flex justify-between text-xs font-bold">
              <span>{supportPct}% support</span>
              <span>{opposePct}% oppose</span>
            </div>
            {verdict ? <p className="text-sm font-bold">{verdict}</p> : null}
            <p className="text-xs text-muted-foreground">
              {total.toLocaleString("en-US")} visitor {total === 1 ? "vote" : "votes"} · One vote per connection · Not a
              scientific poll
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Vote to see how other visitors voted.</p>
        )}
        {message ? <p className="text-sm font-semibold">{message}</p> : null}
      </div>
    </div>
  );
}
