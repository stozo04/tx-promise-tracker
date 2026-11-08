import { redirect } from "next/navigation";

import { loadLedger } from "@/lib/queries";

/**
 * The home page is the first official's Promise vs. Delivered page, the same one the
 * nav and the logo open by default. The official switch (Senator / Governor / District N) is in the header.
 */
export default async function HomePage() {
  const ledger = await loadLedger();
  const first = ledger.politicians[0];
  redirect(first ? `/politicians/${first.slug}` : "/how-we-track");
}
