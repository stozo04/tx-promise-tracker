"use client";

import { useEffect } from "react";

/**
 * Every link to another site (proof, sources, filings, campaign sites) opens
 * in a new tab, so readers never lose their place on the ledger. Links within
 * the site, and in-page jumps, stay in the same tab. Done once here instead of
 * on each link, so links added later behave the same way.
 */
export function ExternalLinksInNewTab() {
  useEffect(() => {
    function mark(event: MouseEvent) {
      const target = event.target as Element | null;
      const link = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      let url: URL;
      try {
        url = new URL(link.href, window.location.href);
      } catch {
        return;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      if (url.origin === window.location.origin) return;
      link.target = "_blank";
      const rel = new Set((link.rel || "").split(/\s+/).filter(Boolean));
      rel.add("noopener");
      rel.add("noreferrer");
      link.rel = [...rel].join(" ");
    }
    // Capture phase, so the attributes are set before the browser follows the link.
    document.addEventListener("click", mark, true);
    document.addEventListener("auxclick", mark, true);
    return () => {
      document.removeEventListener("click", mark, true);
      document.removeEventListener("auxclick", mark, true);
    };
  }, []);
  return null;
}
