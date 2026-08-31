import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { RouteLoadingScreen } from "./route-loading-screen";

const MIN_LOADING_MS = 600;

/**
 * Holds the route loading screen until a minimum warmup promise resolves,
 * then mounts lazy children behind Suspense (same pattern as startup splash).
 */
export function RouteMinimumContentGate({
  active,
  warmup,
  children,
}: {
  active: boolean;
  warmup: () => Promise<unknown>;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const mountTimeRef = useRef(0);
  const minTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setReady(false);
      return;
    }

    mountTimeRef.current = Date.now();
    let cancelled = false;

    const openGate = () => {
      if (cancelled) return;
      const elapsed = Date.now() - mountTimeRef.current;
      if (elapsed < MIN_LOADING_MS) {
        if (minTimerRef.current != null) window.clearTimeout(minTimerRef.current);
        minTimerRef.current = window.setTimeout(openGate, MIN_LOADING_MS - elapsed);
        return;
      }
      setReady(true);
    };

    void warmup()
      .catch(() => {})
      .finally(openGate);

    return () => {
      cancelled = true;
      if (minTimerRef.current != null) window.clearTimeout(minTimerRef.current);
    };
  }, [active, warmup]);

  if (!active) return null;
  if (!ready) return <RouteLoadingScreen />;
  return <Suspense fallback={<RouteLoadingScreen />}>{children}</Suspense>;
}
