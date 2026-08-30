import type { QueryClient } from "@tanstack/react-query";
import {
  gatherCatalogAddons,
  listAddonCatalogDescriptors,
  seedAddonCatalogRowCache,
} from "@/lib/addons";
import type { Meta } from "@/lib/cinemeta";
import { INITIAL_VISIBLE_ROWS } from "@/lib/progressive-rows";
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

async function prefetchInitialAddonRows(
  queryClient: QueryClient,
  settings: Settings,
  authKey: string | null,
): Promise<void> {
  if (settings.homeMode === "classic") return;

  console.time("[harbor:splash] prefetchAddonRows:all");
  const addons = await gatherCatalogAddons(authKey);
  const descriptors = listAddonCatalogDescriptors(addons).slice(0, INITIAL_VISIBLE_ROWS);

  await Promise.all(
    descriptors.map((desc) => {
      const opts = homeAddonCatalogQueryOptions(authKey, desc);
      logHomeAddonQueryKey("splash-prefetch", desc.rowKey, opts.queryKey);
      const timerLabel = `[harbor:splash] prefetchQuery:${desc.rowKey}`;
      console.time(timerLabel);
      seedAddonCatalogRowCache(queryClient, authKey, desc);
      return queryClient.prefetchQuery(opts).finally(() => {
        console.timeEnd(timerLabel);
      });
    }),
  ).catch((err) => {
    console.error("[harbor:splash] prefetchAddonRows:error", err);
  });

  console.timeEnd("[harbor:splash] prefetchAddonRows:all");
}

/** Idempotent startup warmup shared by the splash screen and Home. */
export function ensureHomeStartupPrefetch(
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

  console.time("[harbor:splash] ensureHomeStartupPrefetch");
  inflightKey = key;
  inflight = (async () => {
    try {
      const [core] = await Promise.all([
        prefetchCoreRows(settings),
        prefetchInitialAddonRows(queryClient, settings, authKey),
      ]);
      cachedResult = core;
      cachedKey = key;
      return core;
    } finally {
      console.timeEnd("[harbor:splash] ensureHomeStartupPrefetch");
    }
  })();

  return inflight.finally(() => {
    if (inflightKey === key) {
      inflight = null;
      inflightKey = null;
    }
  });
}
