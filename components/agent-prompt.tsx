"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { SITE_NAME, SITE_URL } from "@/lib/site";

/** The prompt a person pastes into their own AI agent so it can answer questions from this site. */
export function agentPrompt(origin: string) {
  return `You are helping me follow ${SITE_NAME} (${origin}), an independent public website that tracks the campaign promises of Texas's newly elected officials: Senator-elect James Talarico (U.S. Senate) and Governor-elect Gina Hinojosa. It is not a campaign, party, or government site. Every promise on it is a verbatim quote tied to a primary source, and every status change needs cited evidence.

Use the site's read-only JSON API to answer my questions. Never guess and never fill gaps from memory.

HOW TO READ IT
1. GET ${origin}/api/politicians lists the people. Each has a slug (james-talarico, gina-hinojosa), office, election date and term start.
2. GET ${origin}/api/politicians/{slug}/summary gives counts by status, type and topic, plus days until the term starts or days in office.
3. GET ${origin}/api/promises lists promises. Filters: politician (slug), topic, status, type, q (text search), source. Paging: limit (up to 500) and offset. Each promise has summary_text, verbatim_quote, source_url, archive_url, date_said, topic, promise_type, status and updated_at.
4. GET ${origin}/api/promises/{id} gives one promise with its source, archived copies, and status_updates: the timeline of status changes, each with status, evidence_url, evidence_note and decided_at.
5. GET ${origin}/api/sources lists the primary sources (campaign sites, posts). Optional politician filter.
6. GET ${origin}/api/openapi.json is the full machine-readable spec. ${origin}/llms.txt is a short summary.
Example: ${origin}/api/promises?politician=gina-hinojosa&type=explicit_pledge&status=pending lists Hinojosa's direct pledges that are not scored yet.

WHAT THE FIELDS MEAN
- promise_type is explicit_pledge (a direct "I will" pledge) or platform (a broader policy position).
- status is pending, in_progress, kept, partial, broken, superseded or unverified.
- pending means not scored yet. It does NOT mean the official failed. Before the terms start, nearly everything is pending.

WHEN I ASK "WHAT'S NEW?"
- Fetch the promises for the person I name and look for anything whose updated_at is newer than the last time I asked (or the last 7 days if I don't say).
- For each change, open /api/promises/{id} and report the newest status_updates entry: the promise, the new status, the date, the evidence note and the evidence_url.
- If nothing changed, say so plainly and give the current counts from /summary.

RULES
- Read only. There is no write endpoint.
- When you cite a promise, quote verbatim_quote exactly and link source_url. Do not reword a quote.
- When you report a status, link the evidence_url behind it.
- If a field is null, say it is not recorded.
- Voting records, bills and campaign donations are not in this API yet. Do not invent votes, bill numbers, donors or dollar amounts. For those, send me to ${origin}/politicians/{slug}/nerds.
- Stay neutral. Report what the official promised and what the record shows. Do not add opinions about the official, their party or their policies.
- End answers with the links you used.

Start by fetching ${origin}/api/politicians and telling me who is tracked and how many promises each has.`;
}

export function AgentPrompt() {
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const prompt = agentPrompt(SITE_URL);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // Older browsers and some embedded views block the clipboard API.
      textRef.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label htmlFor="agent-prompt" className="font-bold">
          Prompt for your agent
        </label>
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background"
        >
          {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copied ? "Copied" : "Copy prompt"}
        </button>
      </div>
      <textarea
        id="agent-prompt"
        ref={textRef}
        readOnly
        value={prompt}
        rows={16}
        onFocus={(event) => event.currentTarget.select()}
        className="w-full resize-y rounded-2xl border-2 border-border bg-card p-4 font-mono text-[13px] leading-6 text-foreground focus:border-foreground focus:outline-none"
      />
      <p aria-live="polite" className="sr-only">
        {copied ? "Prompt copied to the clipboard." : ""}
      </p>
    </div>
  );
}
