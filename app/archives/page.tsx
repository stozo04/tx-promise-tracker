import type { Metadata } from "next";

import { ArchiveGallery } from "@/components/archive-gallery";
import { htmlOnlySnapshots, screenshotCards } from "@/lib/archives";
import { formatTimestamp } from "@/lib/format";
import { loadLedger } from "@/lib/queries";
import { storagePublicUrl } from "@/lib/urls";

export const metadata: Metadata = {
  title: "Archives",
  description: "Screenshots and saved pages from the campaign sites behind the promise ledger.",
};

export default async function ArchivesPage() {
  const ledger = await loadLedger();
  const cards = screenshotCards(ledger);
  const htmlOnly = htmlOnlySnapshots(ledger);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
      <header className="max-w-2xl space-y-3">
        <h1 className="text-4xl text-ink sm:text-5xl">Archives</h1>
        <p className="text-lg leading-8">
          Pages and pictures saved around the election, so a later edit does not erase the original wording.
        </p>
        <p className="text-sm text-muted-foreground">
          {cards.length} screenshots. {htmlOnly.length} saved {htmlOnly.length === 1 ? "page" : "pages"} without a picture.
        </p>
      </header>
      {cards.length === 0 ? (
        <p className="rounded-3xl border border-dashed px-5 py-8">No screenshots are stored yet.</p>
      ) : (
        <ArchiveGallery items={cards} />
      )}
      {htmlOnly.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-2xl text-ink">Saved pages without a screenshot</h2>
          <ul className="space-y-3">
            {htmlOnly.map((snapshot) => {
              const politician = ledger.politicians.find((person) => person.id === snapshot.politician_id);
              const html = storagePublicUrl(ledger.supabaseUrl, snapshot.html_storage_path);
              return (
                <li key={snapshot.id} className="rounded-2xl bg-card px-4 py-3 text-sm">
                  <p className="font-semibold">{snapshot.title || snapshot.url}</p>
                  <p className="text-muted-foreground">
                    {politician?.name ?? "Unknown"} · {formatTimestamp(snapshot.captured_at)}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-3">
                    <a className="text-bluebonnet underline" href={snapshot.url}>
                      Original
                    </a>
                    {html ? (
                      <a className="text-bluebonnet underline" href={html}>
                        Saved HTML
                      </a>
                    ) : null}
                    {snapshot.wayback_url ? (
                      <a className="text-bluebonnet underline" href={snapshot.wayback_url}>
                        Internet Archive
                      </a>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
