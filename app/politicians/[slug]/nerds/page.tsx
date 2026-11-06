import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NerdsTabs } from "@/components/nerds-tabs";
import { screenshotCards } from "@/lib/archives";
import { dataSourcesFor } from "@/lib/data-sources";
import { officeLabel } from "@/lib/format";
import { loadLedger, politicianBySlug } from "@/lib/queries";
import { teasersFor } from "@/lib/roadmap";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const ledger = await loadLedger();
  return ledger.politicians.map((politician) => ({ slug: politician.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ledger = await loadLedger();
  const politician = politicianBySlug(ledger, slug);
  if (!politician) return { title: "Not found" };
  return {
    title: `For the nerds: ${politician.name}`,
    description: `The raw record on ${politician.name}, ${officeLabel(politician.office)}: upcoming events, votes, campaign money, the archived campaign site, and where every record comes from.`,
  };
}

export default async function NerdsPage({ params }: Props) {
  const { slug } = await params;
  const ledger = await loadLedger();
  const politician = politicianBySlug(ledger, slug);
  if (!politician) notFound();

  const archives = screenshotCards(ledger).filter((card) => card.politicianSlug === politician.slug);
  const lastSyncedAt = ledger.ingestRuns.reduce<string | null>(
    (latest, run) => (latest === null || run.started_at > latest ? run.started_at : latest),
    null,
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-muted-foreground">{officeLabel(politician.office)}</p>
        <h1 className="text-4xl text-ink sm:text-5xl">For the nerds</h1>
        <p className="max-w-2xl text-lg leading-8">The raw record on {politician.name}, with every line cited.</p>
      </header>
      <NerdsTabs
        name={politician.name}
        office={politician.office}
        archives={archives}
        dataSources={dataSourcesFor(politician.office)}
        teasers={teasersFor(politician.slug)}
        lastSyncedAt={lastSyncedAt}
      />
    </div>
  );
}
