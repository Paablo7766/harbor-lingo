import type { QueryClient } from "@tanstack/react-query";
import { safeFetch as fetch } from "@/lib/safe-fetch";
import { homeCatalogCacheKey, readHomeCatalogPlaceholder, writeHomeCatalogCache } from "./cache";
import type { Meta } from "./cinemeta";
import { fetchManifestAt, filterEnabled, loadInstalled } from "./addon-store";
import { runProgressiveRows, upsertOrdered, INITIAL_VISIBLE_ROWS } from "./progressive-rows";
import {
  homeAddonCatalogQueryKey,
  homeAddonCatalogQueryOptions,
  logHomeAddonQueryKey,
} from "./query/home-addon-catalog-query";
import { createRequestScheduler, type RequestScheduler } from "./request-scheduler";

const STREMIO_API = "https://api.strem.io/api";
const MAX_ROWS = 24;

export type CatalogDef = {
  id: string;
  type: string;
  name: string;
  extra?: Array<{ name: string; isRequired?: boolean; options?: string[] }>;
};

export type AddonResource = string | { name: string; types?: string[]; idPrefixes?: string[] };

export type Addon = {
  manifest: {
    id: string;
    name: string;
    version?: string;
    description?: string;
    logo?: string;
    background?: string;
    contactEmail?: string;
    catalogs?: CatalogDef[];
    resources?: AddonResource[];
    types?: string[];
    idPrefixes?: string[];
    behaviorHints?: {
      adult?: boolean;
      p2p?: boolean;
      configurable?: boolean;
      configurationRequired?: boolean;
    };
  };
  transportUrl: string;
};

export type CatalogExtra = { name: string; value: string };

export type AddonCatalogCursor = {
  base: string;
  type: string;
  id: string;
  extras?: CatalogExtra[];
};

export type AddonRow = {
  key: string;
  type: string;
  name: string;
  metas: Meta[];
  more?: AddonCatalogCursor;
};

export function addonAccepts(addon: Addon, resource: string, type: string, id: string): boolean {
  const m = addon.manifest;
  const resources = m.resources ?? [];
  const specific = resources.filter(
    (r): r is { name: string; types?: string[]; idPrefixes?: string[] } =>
      typeof r === "object" && r.name === resource,
  );
  if (specific.length > 0) {
    return specific.some((r) => {
      const typeOk = Array.isArray(r.types) && r.types.includes(type);
      const idOk =
        !r.idPrefixes || r.idPrefixes.length === 0 || r.idPrefixes.some((p) => id.startsWith(p));
      return typeOk && idOk;
    });
  }
  if (!resources.some((r) => r === resource)) return false;
  if (!m.types || !m.types.includes(type)) return false;
  if (m.idPrefixes && m.idPrefixes.length > 0 && !m.idPrefixes.some((p) => id.startsWith(p))) {
    return false;
  }
  return true;
}

async function call<T>(path: string, body: object): Promise<T | null> {
  try {
    const res = await fetch(`${STREMIO_API}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.result ?? null) as T | null;
  } catch {
    return null;
  }
}

export async function userAddons(authKey: string): Promise<Addon[]> {
  const result = await call<{ addons: Addon[] }>("addonCollectionGet", {
    authKey,
    type: "user",
    update: false,
  });
  return result?.addons ?? [];
}

export async function setUserAddons(authKey: string, addons: Addon[]): Promise<boolean> {
  const result = await call<{ success?: boolean }>("addonCollectionSet", {
    authKey,
    type: "user",
    addons: addons.map((a) => {
      const raw = a as Record<string, unknown>;
      return {
        transportUrl: a.transportUrl,
        transportName: typeof raw.transportName === "string" ? raw.transportName : "",
        manifest: a.manifest,
        flags: (raw.flags as { official?: boolean; protected?: boolean } | undefined) ?? {
          official: false,
          protected: false,
        },
      };
    }),
  });
  return result != null;
}

export async function getUserAddonsRaw(authKey: string): Promise<Addon[] | null> {
  const result = await call<{ addons: Addon[] }>("addonCollectionGet", {
    authKey,
    type: "user",
    update: false,
  });
  if (!result || !Array.isArray(result.addons)) return null;
  return result.addons;
}

export async function setUserAddonsRaw(authKey: string, addons: Addon[]): Promise<boolean> {
  if (addons.length === 0) return false;
  const result = await call<{ success?: boolean }>("addonCollectionSet", {
    authKey,
    type: "user",
    addons,
  });
  return result != null;
}

const STRIP_WORDS = ["movies", "movie", "series", "shows", "show", "tv shows", "tv"];

export function normalizeName(name: string, type: string): string {
  let n = (name ?? "").toLowerCase();
  for (const w of STRIP_WORDS) {
    n = n.replace(new RegExp(`\\b${w}\\b`, "g"), "");
  }
  n = n.replace(/[^a-z0-9]+/g, " ").trim();
  return `${n}::${type ?? ""}`;
}

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ac.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export type DebridKeySet = {
  rdKey?: string;
  tbKey?: string;
  adKey?: string;
  pmKey?: string;
  dlKey?: string;
};

export function torrentioConfigFor(keys: DebridKeySet): string {
  const parts: string[] = [];
  if (keys.tbKey) parts.push(`torbox=${keys.tbKey.trim()}`);
  if (keys.rdKey) parts.push(`realdebrid=${keys.rdKey.trim()}`);
  if (keys.adKey) parts.push(`alldebrid=${keys.adKey.trim()}`);
  if (keys.pmKey) parts.push(`premiumize=${keys.pmKey.trim()}`);
  if (keys.dlKey) parts.push(`debridlink=${keys.dlKey.trim()}`);
  return parts.join("|");
}

export function torrentioAddonFor(keys: DebridKeySet): Addon {
  const config = torrentioConfigFor(keys);
  const transport = config
    ? `https://torrentio.strem.fun/${config}/manifest.json`
    : "https://torrentio.strem.fun/manifest.json";
  return {
    transportUrl: transport,
    manifest: {
      id: "com.stremio.torrentio.addon",
      name: "Torrentio",
      logo: "https://torrentio.strem.fun/images/logo_v1.png",
      resources: ["stream"],
      types: ["movie", "series"],
      idPrefixes: ["tt", "kitsu"],
    },
  };
}

export function torrentioBareAddon(): Addon {
  return {
    transportUrl: "https://torrentio.strem.fun/manifest.json",
    manifest: {
      id: "com.stremio.torrentio.bare",
      name: "Torrentio",
      logo: "https://torrentio.strem.fun/images/logo_v1.png",
      resources: ["stream"],
      types: ["movie", "series"],
      idPrefixes: ["tt", "kitsu"],
    },
  };
}

export function torboxAddonFor(tbKey: string): Addon | null {
  const k = tbKey.trim();
  if (!k) return null;
  return {
    transportUrl: `https://stremio.torbox.app/${k}/manifest.json`,
    manifest: {
      id: "app.torbox.stremio",
      name: "TorBox",
      logo: "https://torbox.app/android-chrome-512x512.png",
      resources: ["stream"],
      types: ["movie", "series", "anime"],
      idPrefixes: ["tt", "kitsu", "mal", "tmdb", "anidb", "anilist", "anime-planet"],
    },
  };
}

export function withDebridKeys(addons: Addon[], keys: DebridKeySet): Addon[] {
  const config = torrentioConfigFor(keys);
  const torrentioCount = addons.filter(
    (a) => a.manifest.id === "com.stremio.torrentio.addon",
  ).length;
  return addons.map((a) => {
    if (a.manifest.id !== "com.stremio.torrentio.addon") return a;
    if (torrentioCount > 1) return a;
    if (!/torrentio\.strem\.fun\/manifest\.json$/.test(a.transportUrl)) return a;
    return {
      ...a,
      transportUrl: config
        ? `https://torrentio.strem.fun/${config}/manifest.json`
        : "https://torrentio.strem.fun/manifest.json",
    };
  });
}

export async function gatherCatalogAddons(authKey: string | null): Promise<Addon[]> {
  const stremioRaw = authKey ? await userAddons(authKey).catch(() => [] as Addon[]) : [];
  const stremio = filterEnabled(stremioRaw);
  const seen = new Set(stremio.map((a) => a.transportUrl));
  const localOnly = filterEnabled(loadInstalled()).filter((l) => !seen.has(l.transportUrl));
  const localFull = await Promise.all(
    localOnly.map(async (l): Promise<Addon | null> => {
      if (l.manifest?.catalogs?.length)
        return { manifest: l.manifest, transportUrl: l.transportUrl };
      const manifest = await fetchManifestAt(l.transportUrl).catch(() => l.manifest ?? null);
      return manifest ? { manifest, transportUrl: l.transportUrl } : null;
    }),
  );
  return [...stremio, ...localFull.filter((a): a is Addon => a != null)];
}

const NON_CONTENT_TYPES = new Set(["addon_catalog"]);

function requiredCatalogExtras(cat: CatalogDef): Array<{ name: string; value: string }> | null {
  const required = (cat.extra ?? []).filter((e) => e.isRequired);
  const out: Array<{ name: string; value: string }> = [];
  for (const e of required) {
    if (e.name === "search") return null;
    const opt = e.options?.[0];
    if (!opt) return null;
    out.push({ name: e.name, value: opt });
  }
  return out;
}

function catalogRequestUrl(base: string, cat: CatalogDef): string | null {
  const extras = requiredCatalogExtras(cat);
  if (extras === null) return null;
  if (extras.length === 0) return `${base}/catalog/${cat.type}/${cat.id}.json`;
  const parts = extras.map((e) => `${encodeURIComponent(e.name)}=${encodeURIComponent(e.value)}`);
  return `${base}/catalog/${cat.type}/${cat.id}/${parts.join("&")}.json`;
}

export type AddonCatalogDescriptor = {
  addonId: string;
  addonName: string;
  addonLogo?: string;
  base: string;
  type: string;
  catalogId: string;
  catalogName: string;
  extras?: CatalogExtra[];
  rowKey: string;
  cacheKey: string;
};

export function listAddonCatalogDescriptors(addons: Addon[]): AddonCatalogDescriptor[] {
  const out: AddonCatalogDescriptor[] = [];
  for (const addon of addons) {
    const base = addon.transportUrl.replace(/\/manifest\.json$/, "");
    for (const cat of addon.manifest.catalogs ?? []) {
      if (!cat?.name || !cat.type || !cat.id) continue;
      if (NON_CONTENT_TYPES.has(cat.type.toLowerCase())) continue;
      if (!catalogRequestUrl(base, cat)) continue;
      out.push({
        addonId: addon.manifest.id,
        addonName: addon.manifest.name,
        addonLogo: addon.manifest.logo,
        base,
        type: cat.type,
        catalogId: cat.id,
        catalogName: cat.name,
        extras: requiredCatalogExtras(cat) ?? undefined,
        rowKey: `${addon.manifest.id}-${cat.type}-${cat.id}`,
        cacheKey: homeCatalogCacheKey(
          base,
          cat.type,
          cat.id,
          requiredCatalogExtras(cat) ?? undefined,
        ),
      });
    }
  }
  return out;
}

function catalogRequestUrlFromDesc(desc: AddonCatalogDescriptor): string {
  if (!desc.extras || desc.extras.length === 0) {
    return `${desc.base}/catalog/${desc.type}/${desc.catalogId}.json`;
  }
  const parts = desc.extras.map(
    (e) => `${encodeURIComponent(e.name)}=${encodeURIComponent(e.value)}`,
  );
  return `${desc.base}/catalog/${desc.type}/${desc.catalogId}/${parts.join("&")}.json`;
}

export function seedAddonCatalogRowCache(
  queryClient: QueryClient,
  authKey: string | null,
  desc: AddonCatalogDescriptor,
): void {
  const queryKey = homeAddonCatalogQueryKey(authKey, desc);
  const cached = readHomeCatalogPlaceholder(desc.cacheKey);
  if (cached) {
    queryClient.setQueryData(queryKey, addonRowFromDescriptor(desc, cached));
  }
}

function addonRowFromDescriptor(desc: AddonCatalogDescriptor, metas: Meta[]): AddonRow {
  const origin = {
    id: desc.addonId,
    name: desc.addonName,
    logo: desc.addonLogo,
    base: desc.base,
  };
  return {
    key: desc.rowKey,
    type: desc.type,
    name: desc.catalogName,
    metas: metas.map((m) => ({ ...m, addonOrigin: origin })),
    more: {
      base: desc.base,
      type: desc.type,
      id: desc.catalogId,
      extras: desc.extras,
    },
  };
}

export async function fetchAddonCatalogRow(desc: AddonCatalogDescriptor): Promise<AddonRow | null> {
  const url = catalogRequestUrlFromDesc(desc);
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return null;
  try {
    const json = await res.json();
    const raw: Meta[] = json.metas ?? [];
    if (raw.length === 0) return null;
    const row = addonRowFromDescriptor(desc, raw);
    writeHomeCatalogCache(desc.cacheKey, row.metas, {
      name: desc.catalogName,
      type: desc.type,
      rowKey: desc.rowKey,
      more: row.more,
    });
    return row;
  } catch {
    return null;
  }
}

export async function loadAddonRowsProgressive(
  authKey: string | null,
  opts: {
    dedup?: boolean;
    cap?: number;
    onRows?: (rows: AddonRow[]) => void;
    scheduler?: RequestScheduler;
    queryClient?: QueryClient;
  } = {},
): Promise<AddonRow[]> {
  const dedup = opts.dedup ?? true;
  const cap = opts.cap ?? (dedup ? MAX_ROWS : 200);
  const scheduler = opts.scheduler ?? createRequestScheduler({ concurrency: 6 });
  const addons = await gatherCatalogAddons(authKey);
  const descriptors = listAddonCatalogDescriptors(addons);
  const order = descriptors.map((d) => d.rowKey);
  let collected: AddonRow[] = [];

  const publish = () => {
    opts.onRows?.(collected.slice());
  };

  const acceptRow = (row: AddonRow) => {
    if (dedup) {
      const norm = normalizeName(row.name, row.type);
      collected = collected.filter((r) => normalizeName(r.name, r.type) !== norm);
    } else {
      collected = collected.filter((r) => r.key !== row.key);
    }
    collected = upsertOrdered(collected, row, order);
    if (collected.length > cap) collected = collected.slice(0, cap);
    publish();
  };

  for (const desc of descriptors) {
    const cached = readHomeCatalogPlaceholder(desc.cacheKey);
    if (!cached) continue;
    acceptRow(addonRowFromDescriptor(desc, cached));
  }

  const tasks = descriptors.map((desc, index) => ({
    key: desc.rowKey,
    run: async (): Promise<AddonRow | null> => {
      if (opts.queryClient) {
        seedAddonCatalogRowCache(opts.queryClient, authKey, desc);
        const queryOpts = homeAddonCatalogQueryOptions(authKey, desc);
        if (index < INITIAL_VISIBLE_ROWS) {
          logHomeAddonQueryKey("home-fetch", desc.rowKey, queryOpts.queryKey);
        }
        return opts.queryClient.fetchQuery(queryOpts);
      }
      return fetchAddonCatalogRow(desc);
    },
  }));

  await runProgressiveRows(tasks, order, {
    scheduler,
    onRow: (row) => acceptRow(row),
  });

  return collected;
}

export async function loadAddonRows(
  authKey: string | null,
  opts: { dedup?: boolean; cap?: number; queryClient?: QueryClient } = {},
): Promise<AddonRow[]> {
  return loadAddonRowsProgressive(authKey, opts);
}

export async function fetchAddonMeta(base: string, type: string, id: string): Promise<Meta | null> {
  const res = await fetchWithTimeout(`${base}/meta/${type}/${encodeURIComponent(id)}.json`);
  if (!res || !res.ok) return null;
  try {
    const json = await res.json();
    return (json.meta ?? null) as Meta | null;
  } catch {
    return null;
  }
}

export async function fetchAddonCatalogPage(
  base: string,
  type: string,
  id: string,
  skip: number,
  extras?: Array<{ name: string; value: string }>,
): Promise<Meta[]> {
  const parts: string[] = [];
  for (const e of extras ?? [])
    parts.push(`${encodeURIComponent(e.name)}=${encodeURIComponent(e.value)}`);
  if (skip > 0) parts.push(`skip=${skip}`);
  const seg = parts.length ? `/${parts.join("&")}` : "";
  const res = await fetchWithTimeout(`${base}/catalog/${type}/${id}${seg}.json`);
  if (!res || !res.ok) return [];
  try {
    const json = await res.json();
    return (json.metas ?? []) as Meta[];
  } catch {
    return [];
  }
}

const DEFAULT_CATALOG_PAGE_SIZE = 20;

export function createAddonCatalogFetcher(
  cursor: AddonCatalogCursor,
  opts: { initialPageSize?: number; mapMeta?: (meta: Meta) => Meta } = {},
): (page: number) => Promise<Meta[]> {
  let pageSize = opts.initialPageSize && opts.initialPageSize > 0 ? opts.initialPageSize : null;
  return async (page: number): Promise<Meta[]> => {
    const step = pageSize ?? DEFAULT_CATALOG_PAGE_SIZE;
    const skip = page <= 1 ? 0 : (page - 1) * step;
    const metas = await fetchAddonCatalogPage(
      cursor.base,
      cursor.type,
      cursor.id,
      skip,
      cursor.extras,
    );
    if (metas.length > 0 && pageSize == null) pageSize = metas.length;
    return opts.mapMeta ? metas.map(opts.mapMeta) : metas;
  };
}

const TMDB_PROVIDER_ID_PATTERNS: RegExp[] = [
  /^com\.aio\.metadata$/i,
  /tmdb/i,
  /^com\.stremio\.streaming-catalogs$/i,
];

export function hasTmdbProviderAddon(addons: Addon[]): boolean {
  return addons.some((a) => {
    const id = a.manifest?.id ?? "";
    const name = a.manifest?.name ?? "";
    return TMDB_PROVIDER_ID_PATTERNS.some((re) => re.test(id) || re.test(name));
  });
}
