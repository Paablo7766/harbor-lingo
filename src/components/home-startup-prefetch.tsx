import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { ensureHomeStartupPrefetch } from "@/lib/query/prefetch-home-startup";
import { useSettings } from "@/lib/settings";

/** Warms Home catalog rows during the startup splash, then signals readiness. */
export function HomeStartupPrefetch({ onReady }: { onReady?: () => void }) {
  const { settings } = useSettings();
  const { authKey } = useAuth();
  const queryClient = useQueryClient();
  const signaled = useRef(false);

  useEffect(() => {
    let cancelled = false;
    console.time("[harbor:splash] HomeStartupPrefetch");
    void ensureHomeStartupPrefetch(queryClient, settings, authKey)
      .catch(() => ({ coreRows: [], hero: [] }))
      .finally(() => {
        console.timeEnd("[harbor:splash] HomeStartupPrefetch");
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
    settings,
    settings.homeMode,
    settings.homeShowAllAddonRows,
    settings.region,
    settings.tmdbKey,
    settings.tmdbLanguage,
  ]);

  return null;
}
