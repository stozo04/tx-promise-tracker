import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <p className="text-sm font-semibold text-bluebonnet">404</p>
      <h1 className="mt-2 text-4xl text-ink">That page is not in the ledger.</h1>
      <p className="mt-3 text-muted-foreground">
        The link may be old, or the record was never stored. Nothing was invented to stand in for it.
      </p>
      <Link href="/" className="mt-6 inline-block font-semibold text-bluebonnet underline">
        Back to the scoreboard
      </Link>
    </div>
  );
}
