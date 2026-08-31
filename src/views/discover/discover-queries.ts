import type { QueryClient } from "@tanstack/react-query";
import { selectDailyRows } from "@/lib/feed";
import { buildFeaturedFast } from "@/lib/feed/featured";
import { getStore } from "@/lib/discover/store";
import type { Settings } from "@/lib/settings/types";

const STALE_MS = 5 * 60_000;
const ROW_COUNT = 14;

/** Banner + first rails required before the Discover route gate may open. */
export const MIN_DISCOVER_RAILS = 2;

/** Day-scoped: daily row rotation must not mix yesterday's cached pages. */
export function discoverScope(settings: Settings): string {
  const streaming = Object.entries(settings.streaming)
    .filter(([, on]) => on)
    .map(([id]) => id)
    .join(",");
  return [
    `tmdb:${settings.tmdbKey}`,
    settings.region,
    settings.tmdbLanguage,
    settings.feedLocaleBias ? "bias" : "nobias",
    settings.preferredLanguages.join(","),
    streaming,
    new Date().toDateString(),
  ].join(":");
}

export const discoverKeys = {
  featuredFast: (scope: string) => ["harbor", "discover", "featured-fast", scope] as const,
  featured: (scope: string) => ["harbor", "discover", "featured", scope] as const,
  critics: (scope: string) => ["harbor", "discover", "critics", scope] as const,
  rail: (scope: string, railId: string, page: number) =>
    ["harbor", "discover", "rail", scope, railId, page] as const,
};

export function discoverDailyRows(settings: Settings) {
  return selectDailyRows(settings.tmdbKey, getStore().affinity, settings, ROW_COUNT);
}

function discoverPrefetchKey(settings: Settings): string {
  return discoverScope(settings);
}

let cachedDiscoverKey: string | null = null;
let discoverInflight: Promise<void> | null = null;
let discoverInflightKey: string | null = null;

async function prefetchDiscoverMinimum(
  queryClient: QueryClient,
  settings: Settings,
): Promise<void> {
  if (!settings.tmdbKey) return;

  const scope = discoverScope(settings);
  const rows = discoverDailyRows(settings).slice(0, MIN_DISCOVER_RAILS);
  const prefetches = [
    queryClient.prefetchQuery({
      queryKey: discoverKeys.featuredFast(scope),
      queryFn: () => buildFeaturedFast(settings.tmdbKey, settings),
      staleTime: STALE_MS,
    }),
    ...rows.map((def) =>
      queryClient.prefetchQuery({
        queryKey: discoverKeys.rail(scope, def.id, 1),
        queryFn: () => def.fetch(1),
        staleTime: STALE_MS,
      }),
    ),
  ];

  console.time("[harbor:route] ensureDiscoverMinimumPrefetch");
  await Promise.all(prefetches).catch((err) => {
    console.error("[harbor:route] ensureDiscoverMinimumPrefetch:error", err);
  });
  console.timeEnd("[harbor:route] ensureDiscoverMinimumPrefetch");
}

function runDiscoverMinimumPrefetch(queryClient: QueryClient, settings: Settings): Promise<void> {
  const key = discoverPrefetchKey(settings);
  if (cachedDiscoverKey === key) {
    return Promise.resolve();
  }
  if (discoverInflight && discoverInflightKey === key) {
    return discoverInflight;
  }

  discoverInflightKey = key;
  discoverInflight = prefetchDiscoverMinimum(queryClient, settings)
    .then(() => {
      cachedDiscoverKey = key;
    })
    .finally(() => {
      if (discoverInflightKey === key) {
        discoverInflight = null;
        discoverInflightKey = null;
      }
    });

  return discoverInflight;
}

/** Resolves once banner + above-the-fold Discover rails are warm enough to reveal the view. */
export function ensureDiscoverMinimumPrefetch(
  queryClient: QueryClient,
  settings: Settings,
): Promise<void> {
  return runDiscoverMinimumPrefetch(queryClient, settings);
}

/** Warm the banner + first rails so Discover paints from cache on open. */
export function prefetchDiscoverPage(queryClient: QueryClient, settings: Settings, limit = 6) {
  if (!settings.tmdbKey) return;
  void ensureDiscoverMinimumPrefetch(queryClient, settings);
  const scope = discoverScope(settings);
  for (const def of discoverDailyRows(settings).slice(MIN_DISCOVER_RAILS, limit)) {
    void queryClient.prefetchQuery({
      queryKey: discoverKeys.rail(scope, def.id, 1),
      queryFn: () => def.fetch(1),
      staleTime: STALE_MS,
    });
  }
}
