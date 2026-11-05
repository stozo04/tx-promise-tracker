export function StarMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M32 4.5 39.6 22.2 58.4 23.6 44.2 35.6 48.4 53.8 32 44.2 15.6 53.8 19.8 35.6 5.6 23.6 24.4 22.2 32 4.5Z"
      />
    </svg>
  );
}
