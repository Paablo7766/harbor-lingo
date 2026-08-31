import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { ensureHomeStartupMinimumPrefetch } from "@/lib/query/prefetch-home-startup";
import { useSettings } from "@/lib/settings";

/** Warms Home catalog rows during the startup splash, then signals readiness. */
export function HomeStartupPrefetch({ onReady }: { onReady?: () => void }) {
  const { settings } = useSettings();
  const { authKey } = useAuth();
  const queryClient = useQueryClient();
  const signaled = useRef(false);
  const timerOpen = useRef(false);
  const TIMER_LABEL = "[harbor:splash] HomeStartupPrefetch";

  useEffect(() => {
    let cancelled = false;
    if (!timerOpen.current) {
      console.time(TIMER_LABEL);
      timerOpen.current = true;
    }
    void ensureHomeStartupMinimumPrefetch(queryClient, settings, authKey)
      .catch(() => ({ coreRows: [], hero: [] }))
      .finally(() => {
        if (timerOpen.current) {
          console.timeEnd(TIMER_LABEL);
          timerOpen.current = false;
        }
        if (cancelled || signaled.current) return;
        signaled.current = true;
        onReady?.();
      });
    return () => {
      cancelled = true;
    };
  }, [
    authKey,
    onReady,
    queryClient,
    settings.homeMode,
    settings.homeShowAllAddonRows,
    settings.region,
    settings.tmdbKey,
    settings.tmdbLanguage,
  ]);

  return null;
}
