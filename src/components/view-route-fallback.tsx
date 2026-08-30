/** Shown while a lazy view chunk loads (App Suspense boundaries). */
export function ViewRouteFallback() {
  return (
    <div
      className="flex min-h-[min(40vh,320px)] flex-1 items-center justify-center py-16"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-edge-soft border-t-accent" />
    </div>
  );
}
