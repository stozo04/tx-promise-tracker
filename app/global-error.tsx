"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Georgia, serif", background: "#f4efe4", color: "#1c2430", padding: "3rem" }}>
        <h1>The ledger did not load.</h1>
        <p>The tracker could not read its data, so this page is empty on purpose.</p>
        <button type="button" onClick={() => reset()}>
          Try again
        </button>
      </body>
    </html>
  );
}
