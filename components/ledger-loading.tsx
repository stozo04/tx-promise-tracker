/** The placeholder shown while a page's record streams in under Suspense. Matches app/loading.tsx. */
export function LedgerLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <p role="status">Opening the ledger…</p>
    </div>
  );
}
