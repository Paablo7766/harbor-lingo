import { fetchAddonCatalogRow, type AddonCatalogDescriptor } from "@/lib/addons";
import { queryKeys } from "./keys";

/** Shared cache window — must match between splash prefetch and Home fetchQuery. */
export const HOME_ADDON_CATALOG_STALE_MS = 5 * 60_000;
export const HOME_ADDON_CATALOG_GC_MS = 24 * 60 * 60_000;

export function homeAddonCatalogQueryKey(
  authKey: string | null,
  desc: Pick<AddonCatalogDescriptor, "base" | "type" | "catalogId" | "extras">,
) {
  return queryKeys.catalog.row(authKey, desc.base, desc.type, desc.catalogId, desc.extras);
}

export function homeAddonCatalogQueryOptions(authKey: string | null, desc: AddonCatalogDescriptor) {
  const queryKey = homeAddonCatalogQueryKey(authKey, desc);
  return {
    queryKey,
    queryFn: () => fetchAddonCatalogRow(desc),
    staleTime: HOME_ADDON_CATALOG_STALE_MS,
    gcTime: HOME_ADDON_CATALOG_GC_MS,
  } as const;
}

export function logHomeAddonQueryKey(
  source: "splash-prefetch" | "home-fetch",
  rowKey: string,
  queryKey: readonly unknown[],
) {
  console.log(`[harbor:splash] queryKey:${source}`, rowKey, JSON.stringify(queryKey));
}
