import { createRequestScheduler } from "@/lib/request-scheduler";

const BASE = "https://harbor.site/api/imdb";
const FETCH_TIMEOUT_MS = 2500;
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const TITLE_CONCURRENCY = 4;

export type ParentalCategory = { category: string; severity: string };

type CacheEntry<T> = { value: T; expiresAt: number };

const titleScheduler = createRequestScheduler({ concurrency: TITLE_CONCURRENCY });

let harborImdbRatingsEnabled = false;

export function setHarborImdbRatingsEnabled(enabled: boolean): void {
  harborImdbRatingsEnabled = enabled;
}

const titleCache = new Map<string, CacheEntry<number | null>>();
const parentalCache = new Map<string, ParentalCategory[]>();
const parentalInflight = new Map<string, Promise<ParentalCategory[]>>();
const episodeCache = new Map<string, Map<string, number>>();
const episodeInflight = new Map<string, Promise<Map<string, number>>>();

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeTitleCache(tt: string, value: number | null): void {
  titleCache.set(tt, {
    value,
    expiresAt: value != null ? Number.POSITIVE_INFINITY : Date.now() + NEGATIVE_CACHE_TTL_MS,
  });
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function harborImdbEpisodes(seriesTt: string): Promise<Map<string, number>> {
  if (!seriesTt.startsWith("tt")) return new Map();
  const cached = episodeCache.get(seriesTt);
  if (cached) return cached;
  const pending = episodeInflight.get(seriesTt);
  if (pending) return pending;
  const p = (async () => {
    try {
      const res = await fetchWithTimeout(`${BASE}/episodes/${seriesTt}`);
      const map = new Map<string, number>();
      if (res.ok) {
        const j = (await res.json()) as { ratings?: Record<string, number> };
        for (const [k, raw] of Object.entries(j.ratings ?? {})) {
          const v = Number(raw);
          if (Number.isFinite(v) && v > 0) map.set(k, v);
        }
      }
      episodeCache.set(seriesTt, map);
      return map;
    } catch {
      const empty = new Map<string, number>();
      episodeCache.set(seriesTt, empty);
      return empty;
    } finally {
      episodeInflight.delete(seriesTt);
    }
  })();
  episodeInflight.set(seriesTt, p);
  return p;
}

export function harborImdbEpisodesCached(seriesTt: string): Map<string, number> | undefined {
  return episodeCache.get(seriesTt);
}

export async function harborImdbTitle(tt: string): Promise<number | null> {
  if (!harborImdbRatingsEnabled) return null;
  if (!tt.startsWith("tt")) return null;

  const cached = readCache(titleCache, tt);
  if (cached !== undefined) return cached;

  return titleScheduler.schedule(tt, async () => {
    const again = readCache(titleCache, tt);
    if (again !== undefined) return again;

    try {
      const res = await fetchWithTimeout(`${BASE}/title/${tt}`);
      if (!res.ok) {
        writeTitleCache(tt, null);
        return null;
      }
      const j = (await res.json()) as { rating?: number | null };
      const v = Number(j.rating);
      const out = Number.isFinite(v) && v > 0 ? v : null;
      writeTitleCache(tt, out);
      return out;
    } catch {
      writeTitleCache(tt, null);
      return null;
    }
  });
}

export async function harborImdbParental(tt: string): Promise<ParentalCategory[]> {
  if (!tt.startsWith("tt")) return [];
  const cached = parentalCache.get(tt);
  if (cached) return cached;
  const pending = parentalInflight.get(tt);
  if (pending) return pending;
  const p = (async () => {
    try {
      const res = await fetchWithTimeout(`${BASE}/parental/${tt}`);
      const out: ParentalCategory[] = [];
      if (res.ok) {
        const j = (await res.json()) as { categories?: ParentalCategory[] };
        for (const c of j.categories ?? []) {
          if (c && typeof c.category === "string" && typeof c.severity === "string") {
            out.push({ category: c.category, severity: c.severity });
          }
        }
      }
      parentalCache.set(tt, out);
      return out;
    } catch {
      parentalCache.set(tt, []);
      return [];
    } finally {
      parentalInflight.delete(tt);
    }
  })();
  parentalInflight.set(tt, p);
  return p;
}
