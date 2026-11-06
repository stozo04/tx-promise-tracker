"use client";

import { useId, useState } from "react";
import { ExternalLink, Phone } from "lucide-react";

export type ContactChannel = {
  label: string;
  href: string;
  text: string;
};

/**
 * The "Contact them" button and the panel it opens.
 * Only channels stored in the ledger are listed. Phone numbers and office
 * addresses are not stored yet, so the panel says where they will come from
 * instead of guessing them.
 */
export function ContactSection({
  name,
  campaignHref,
  officeChannels,
  campaignChannels,
  officeNote,
}: {
  name: string;
  campaignHref: string | null;
  officeChannels: ContactChannel[];
  campaignChannels: ContactChannel[];
  officeNote: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-foreground bg-foreground px-4 text-sm font-bold text-background"
        >
          <Phone className="size-4" aria-hidden="true" />
          {open ? "Hide contact info" : "Contact them"}
        </button>
        {campaignHref ? (
          <a
            href={campaignHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-foreground px-4 text-sm font-bold"
          >
            Their campaign website
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      {open ? (
        <section
          id={panelId}
          aria-label={`Contact ${name}`}
          className="grid gap-3 rounded-2xl bg-secondary p-4 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
              Official office
            </h2>
            {officeChannels.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {officeChannels.map((channel) => (
                  <li key={channel.href}>
                    <span className="text-sm text-muted-foreground">{channel.label}: </span>
                    <a href={channel.href} className="font-bold underline underline-offset-4">
                      {channel.text}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-sm leading-6">{officeNote}</p>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
              Campaign channels
            </h2>
            {campaignChannels.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {campaignChannels.map((channel) => (
                  <li key={channel.href}>
                    <span className="text-sm text-muted-foreground">{channel.label}: </span>
                    <a href={channel.href} className="font-bold underline underline-offset-4">
                      {channel.text}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-6">No campaign channels are stored.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
