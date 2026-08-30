import type { Meta } from "./cinemeta";

export function lruSet<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const first = map.keys().next();
    if (first.done) break;
    map.delete(first.value);
  }
}

export function lruGet<K, V>(map: Map<K, V>, key: K): V | undefined {
  const v = map.get(key);
  if (v === undefined) return undefined;
  map.delete(key);
  map.set(key, v);
  return v;
}

/** Placeholder age for instant Home row paint (stale-while-revalidate). */
export const HOME_CATALOG_PLACEHOLDER_MS = 30 * 60_000;
/** Max age before a persisted Home catalog entry is discarded. */
export const HOME_CATALOG_MAX_AGE_MS = 24 * 60 * 60_000;

const HOME_CATALOG_STORAGE_KEY = "harbor.homeCatalogRows.v1";

export type CatalogExtras = Array<{ name: string; value: string }>;

type HomeCatalogCacheEntry = {
  ts: number;
  cacheKey: string;
  metas: Meta[];
  name?: string;
  type?: string;
  rowKey?: string;
  more?: {
    base: string;
    type: string;
    id: string;
    extras?: CatalogExtras;
  };
};

type HomeCatalogStore = Record<string, HomeCatalogCacheEntry>;

function normalizeAddonBase(base: string): string {
  return base.replace(/\/manifest\.json$/i, "").replace(/\/+$/, "");
}

function extrasSignature(extras?: CatalogExtras): string {
  if (!extras?.length) return "";
  return extras
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name) || a.value.localeCompare(b.value))
    .map((e) => `${e.name}=${e.value}`)
    .join("&");
}

/**
 * Unique cache key per catalog request: addon base URL + type + catalog id + required extras.
 */
export function homeCatalogCacheKey(
  base: string,
  type: string,
  catalogId: string,
  extras?: CatalogExtras,
): string {
  const root = `${normalizeAddonBase(base)}::${type}::${catalogId}`;
  const sig = extrasSignature(extras);
  return sig ? `${root}::${sig}` : root;
}

/** Cache key for built-in Home rows (TMDB, Cinemeta, etc.). */
export function homeBuiltRowCacheKey(source: string, type: string, rowKey: string): string {
  return `${source}::${type}::${rowKey}`;
}

export function catalogRowQueryExtrasKey(extras?: CatalogExtras): string {
  const sig = extrasSignature(extras);
  return sig || "_";
}

function readStore(): HomeCatalogStore {
  try {
    const raw = localStorage.getItem(HOME_CATALOG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as HomeCatalogStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: HomeCatalogStore): void {
  try {
    localStorage.setItem(HOME_CATALOG_STORAGE_KEY, JSON.stringify(store));
  } catch {
    void 0;
  }
}

export function pruneHomeCatalogCache(now = Date.now()): void {
  const store = readStore();
  let changed = false;
  for (const [key, entry] of Object.entries(store)) {
    if (!entry?.ts || now - entry.ts > HOME_CATALOG_MAX_AGE_MS) {
      delete store[key];
      changed = true;
    }
  }
  if (changed) writeStore(store);
}

export function readHomeCatalogCacheEntry(key: string): HomeCatalogCacheEntry | undefined {
  pruneHomeCatalogCache();
  const entry = readStore()[key];
  if (!entry?.ts || !Array.isArray(entry.metas)) return undefined;
  if (Date.now() - entry.ts > HOME_CATALOG_MAX_AGE_MS) return undefined;
  if (entry.cacheKey && entry.cacheKey !== key) return undefined;
  return entry;
}

/** Data fresh enough to show instantly while revalidating (< 30 min). Exact key match only. */
export function readHomeCatalogPlaceholder(key: string): Meta[] | undefined {
  const entry = readHomeCatalogCacheEntry(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > HOME_CATALOG_PLACEHOLDER_MS) return undefined;
  return entry.metas.length > 0 ? entry.metas : undefined;
}

export function writeHomeCatalogCache(
  key: string,
  metas: Meta[],
  meta?: Omit<HomeCatalogCacheEntry, "ts" | "metas" | "cacheKey">,
): void {
  if (metas.length === 0) return;
  const store = readStore();
  store[key] = { ts: Date.now(), cacheKey: key, metas, ...meta };
  pruneHomeCatalogCache();
  writeStore(store);
}
