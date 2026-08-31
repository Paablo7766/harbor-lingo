import type { QueryClient } from "@tanstack/react-query";
import {
  gatherCatalogAddons,
  listAddonCatalogDescriptors,
  seedAddonCatalogRowCache,
  type AddonCatalogDescriptor,
} from "@/lib/addons";
import type { Meta } from "@/lib/cinemeta";
import { INITIAL_VISIBLE_ROWS, MIN_SPLASH_ADDON_ROWS } from "@/lib/progressive-rows";
import type { Settings } from "@/lib/settings/types";
import { buildCinemetaRows, buildTmdbRows } from "@/views/home/home-rows";
import type { HomeRow } from "@/views/home/home-types";
import { homeAddonCatalogQueryOptions, logHomeAddonQueryKey } from "./home-addon-catalog-query";

export type HomeStartupPrefetchResult = {
  coreRows: HomeRow[];
  hero: Meta[];
};

function settingsPrefetchKey(settings: Settings, authKey: string | null): string {
  return [
    authKey ?? "anon",
    settings.homeMode,
    settings.tmdbKey ?? "",
    settings.tmdbLanguage,
    settings.region,
    settings.homeShowAllAddonRows,
  ].join("|");
}

let cachedResult: HomeStartupPrefetchResult | null = null;
let cachedKey: string | null = null;
let inflight: Promise<HomeStartupPrefetchResult> | null = null;
let inflightKey: string | null = null;
let addonCatalogPrefetchInflight: Promise<void> | null = null;
let addonCatalogPrefetchKey: string | null = null;

function addonCatalogPrefetchSessionKey(
  authKey: string | null,
  homeMode: Settings["homeMode"],
): string {
  return `${authKey ?? "anon"}|${homeMode}`;
}

export function takeHomeStartupPrefetch(
  settings: Settings,
  authKey: string | null,
): HomeStartupPrefetchResult | null {
  if (cachedKey !== settingsPrefetchKey(settings, authKey)) return null;
  return cachedResult;
}

async function prefetchCoreRows(settings: Settings): Promise<HomeStartupPrefetchResult> {
  console.time("[harbor:splash] prefetchCoreRows");
  try {
    if (settings.homeMode === "classic") {
      return { coreRows: [], hero: [] };
    }

    let built = settings.tmdbKey
      ? await buildTmdbRows(settings).catch(() => ({
          rows: [] as HomeRow[],
          hero: [] as Meta[],
        }))
      : await buildCinemetaRows().catch(() => ({ rows: [] as HomeRow[], hero: [] as Meta[] }));

    if (built.rows.length === 0) {
      built = await buildCinemetaRows().catch(() => ({
        rows: [] as HomeRow[],
        hero: [] as Meta[],
      }));
    }

    return { coreRows: built.rows, hero: built.hero };
  } finally {
    console.timeEnd("[harbor:splash] prefetchCoreRows");
  }
}

function prefetchAddonCatalog(
  queryClient: QueryClient,
  authKey: string | null,
  desc: AddonCatalogDescriptor,
): Promise<void> {
  const opts = homeAddonCatalogQueryOptions(authKey, desc);
  logHomeAddonQueryKey("splash-prefetch", desc.rowKey, opts.queryKey);
  const timerLabel = `[harbor:splash] prefetchQuery:${desc.rowKey}`;
  console.time(timerLabel);
  seedAddonCatalogRowCache(queryClient, authKey, desc);
  return queryClient.prefetchQuery(opts).finally(() => {
    console.timeEnd(timerLabel);
  });
}

/** Idempotent addon-catalog warmup — survives splash timeout and settings-key churn. */
function ensureAddonCatalogPrefetch(
  queryClient: QueryClient,
  authKey: string | null,
  homeMode: Settings["homeMode"],
): Promise<void> {
  const key = addonCatalogPrefetchSessionKey(authKey, homeMode);
  if (addonCatalogPrefetchInflight && addonCatalogPrefetchKey === key) {
    return addonCatalogPrefetchInflight;
  }

  console.time("[harbor:splash] prefetchAddonRows:all");
  addonCatalogPrefetchKey = key;
  addonCatalogPrefetchInflight = (async () => {
    const addons = await gatherCatalogAddons(authKey);
    const descriptors = listAddonCatalogDescriptors(addons).slice(0, INITIAL_VISIBLE_ROWS);
    if (descriptors.length === 0) return;

    const prefetches = descriptors.map((desc) => prefetchAddonCatalog(queryClient, authKey, desc));
    const minCount = Math.min(MIN_SPLASH_ADDON_ROWS, descriptors.length);

    if (homeMode === "classic") {
      console.time("[harbor:splash] prefetchAddonRows:min");
      await Promise.all(prefetches.slice(0, minCount)).catch((err) => {
        console.error("[harbor:splash] prefetchAddonRows:min:error", err);
      });
      console.timeEnd("[harbor:splash] prefetchAddonRows:min");
    }

    await Promise.all(prefetches).catch((err) => {
      console.error("[harbor:splash] prefetchAddonRows:bg:error", err);
    });
  })().finally(() => {
    console.timeEnd("[harbor:splash] prefetchAddonRows:all");
    if (addonCatalogPrefetchKey === key) {
      addonCatalogPrefetchInflight = null;
      addonCatalogPrefetchKey = null;
    }
  });

  return addonCatalogPrefetchInflight;
}

/**
 * Starts prefetch for all above-the-fold addon catalogs. Resolves once the
 * minimum subset needed to dismiss the splash is ready; remaining prefetches
 * keep running in the background.
 */
async function prefetchInitialAddonRows(
  queryClient: QueryClient,
  authKey: string | null,
  homeMode: Settings["homeMode"],
): Promise<void> {
  const inflight = ensureAddonCatalogPrefetch(queryClient, authKey, homeMode);
  if (homeMode === "classic") {
    await inflight;
  }
}

function runHomeStartupPrefetch(
  queryClient: QueryClient,
  settings: Settings,
  authKey: string | null,
): Promise<HomeStartupPrefetchResult> {
  const key = settingsPrefetchKey(settings, authKey);
  if (cachedKey === key && cachedResult) {
    return Promise.resolve(cachedResult);
  }
  if (inflight && inflightKey === key) {
    return inflight;
  }

  console.time("[harbor:splash] ensureHomeStartupMinimumPrefetch");
  inflightKey = key;
  const run = (async (): Promise<HomeStartupPrefetchResult> => {
    try {
      const [core] = await Promise.all([
        prefetchCoreRows(settings),
        prefetchInitialAddonRows(queryClient, authKey, settings.homeMode),
      ]);
      cachedResult = core;
      cachedKey = key;
      return core;
    } finally {
      console.timeEnd("[harbor:splash] ensureHomeStartupMinimumPrefetch");
      if (inflightKey === key) {
        inflight = null;
        inflightKey = null;
      }
    }
  })();
  inflight = run;
  return run;
}

/** Resolves once above-the-fold Home content is warm enough to dismiss the splash. */
export function ensureHomeStartupMinimumPrefetch(
  queryClient: QueryClient,
  settings: Settings,
  authKey: string | null,
): Promise<HomeStartupPrefetchResult> {
  return runHomeStartupPrefetch(queryClient, settings, authKey);
}

/** Idempotent startup warmup shared by the splash screen and Home. */
export function ensureHomeStartupPrefetch(
  queryClient: QueryClient,
  settings: Settings,
  authKey: string | null,
): Promise<HomeStartupPrefetchResult> {
  return ensureHomeStartupMinimumPrefetch(queryClient, settings, authKey);
}
