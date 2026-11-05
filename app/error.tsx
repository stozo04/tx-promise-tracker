"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <h1 className="text-4xl text-ink">The ledger did not load.</h1>
      <p className="mt-3 text-muted-foreground">
        This page stays blank rather than guess. Try again in a moment.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        Try again
      </button>
    </div>
  );
}
