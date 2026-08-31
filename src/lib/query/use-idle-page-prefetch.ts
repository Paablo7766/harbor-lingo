import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { preloadCatalogPage } from "@/lib/catalog-page";
import { fetchAddonsDirectory, fetchInstalledAddonsPair } from "@/lib/addons-store/store";
import { preloadNavViewChunk } from "@/router/view-chunks";
import { queryKeys } from "@/lib/query/keys";
import { useSettings } from "@/lib/settings";
import type { Settings } from "@/lib/settings/types";
import { useAuth } from "@/lib/auth";
import { prefetchDiscoverPage } from "@/views/discover/discover-queries";
import { buildShowHero } from "@/views/shows/hero-curation";
import { showSpecs } from "@/views/shows/show-specs";
import type { View } from "@/lib/view";

/** Rows warmed per page on intent/idle preload. */
const PRELOAD_LIMIT = 8;

/** Delay after mount before background nav warmup (Home startup is fast now). */
const POST_HOME_WARMUP_MS = 400;

/** Preload one nav page's first rows into TanStack Query (hover / focus / idle). */
export function preloadNavPage(
  queryClient: ReturnType<typeof useQueryClient>,
  view: string,
  tmdbKey: string,
  region: string,
  authKey: string | null = null,
  settings?: Settings,
): void {
  if (view === "discover") {
    if (settings) prefetchDiscoverPage(queryClient, settings);
    return;
  }
  if (view === "addons") {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.addons.installed(authKey),
      queryFn: () => fetchInstalledAddonsPair(authKey),
      staleTime: 60_000,
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.addons.directory(),
      queryFn: fetchAddonsDirectory,
      staleTime: 60 * 60_000,
    });
    return;
  }
  if (!tmdbKey) return;
  const scope = `tmdb:${tmdbKey}:${region}`;
  if (view === "shows") {
    void preloadCatalogPage(queryClient, {
      pageId: "shows",
      scope,
      specs: showSpecs(tmdbKey),
      heroFetcher: () => buildShowHero(tmdbKey),
      limit: PRELOAD_LIMIT,
    });
  }
}

const WARM_VIEWS = ["discover", "shows"] as const;

const NAV_INTENT_DEBOUNCE_MS = 120;

/** Hover/focus preload debounced so sidebar expand animation stays smooth. */
export function useDebouncedNavIntent() {
  const warm = useNavIntentPreload();
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  return useCallback(
    (view: View) => {
      const timers = timersRef.current;
      const pending = timers.get(view);
      if (pending) clearTimeout(pending);
      timers.set(
        view,
        setTimeout(() => {
          timers.delete(view);
          warm(view);
        }, NAV_INTENT_DEBOUNCE_MS),
      );
    },
    [warm],
  );
}

export function useNavIntentPreload() {
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const { authKey } = useAuth();

  return useCallback(
    (view: View) => {
      preloadNavViewChunk(view);
      preloadNavPage(queryClient, view, settings.tmdbKey, settings.region, authKey, settings);
    },
    [authKey, queryClient, settings],
  );
}

/** Background warmup so catalog routes paint from cache on first open. */
export function useIdlePagePrefetch() {
  const { settings } = useSettings();
  const { authKey } = useAuth();
  const queryClient = useQueryClient();
  const tmdbKey = settings.tmdbKey;
  const region = settings.region;

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      for (const view of WARM_VIEWS) {
        preloadNavViewChunk(view);
        preloadNavPage(queryClient, view, tmdbKey, region, authKey, settings);
      }
    };

    const id = window.setTimeout(run, POST_HOME_WARMUP_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [tmdbKey, region, queryClient, authKey, settings]);
}
