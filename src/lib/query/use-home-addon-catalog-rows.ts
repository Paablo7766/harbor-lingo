import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  gatherCatalogAddons,
  listAddonCatalogDescriptors,
  normalizeName,
  seedAddonCatalogRowCache,
  type AddonCatalogDescriptor,
  type AddonRow,
} from "@/lib/addons";
import { upsertOrdered } from "@/lib/progressive-rows";
import { homeAddonCatalogQueryOptions } from "./home-addon-catalog-query";

const MAX_ROWS = 24;

function collectAddonRows(
  descriptors: AddonCatalogDescriptor[],
  rowsByKey: Map<string, AddonRow | null | undefined>,
  dedup: boolean,
): AddonRow[] {
  const order = descriptors.map((d) => d.rowKey);
  let collected: AddonRow[] = [];

  for (const desc of descriptors) {
    const row = rowsByKey.get(desc.rowKey);
    if (!row) continue;
    if (dedup) {
      const norm = normalizeName(row.name, row.type);
      collected = collected.filter((r) => normalizeName(r.name, r.type) !== norm);
    } else {
      collected = collected.filter((r) => r.key !== row.key);
    }
    collected = upsertOrdered(collected, row, order);
    if (collected.length > MAX_ROWS) collected = collected.slice(0, MAX_ROWS);
  }

  return collected;
}

/** Loads addon catalog rows via per-row React Query subscriptions. */
export function useHomeAddonCatalogRows(
  authKey: string | null,
  opts: { dedup?: boolean; addonsTick?: number } = {},
) {
  const dedup = opts.dedup ?? true;
  const queryClient = useQueryClient();
  const [descriptors, setDescriptors] = useState<AddonCatalogDescriptor[]>([]);

  useEffect(() => {
    let cancelled = false;
    void gatherCatalogAddons(authKey)
      .then((addons) => {
        if (cancelled) return;
        setDescriptors(listAddonCatalogDescriptors(addons));
      })
      .catch(() => {
        if (!cancelled) setDescriptors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authKey, opts.addonsTick]);

  useEffect(() => {
    for (const desc of descriptors) {
      seedAddonCatalogRowCache(queryClient, authKey, desc);
    }
  }, [authKey, descriptors, queryClient]);

  const queries = useQueries({
    queries: descriptors.map((desc) => ({
      ...homeAddonCatalogQueryOptions(authKey, desc),
      enabled: descriptors.length > 0,
    })),
  });

  const rowsByKey = useMemo(() => {
    const out = new Map<string, AddonRow | null | undefined>();
    descriptors.forEach((desc, index) => {
      out.set(desc.rowKey, queries[index]?.data);
    });
    return out;
  }, [descriptors, queries]);

  const addonRows = useMemo(
    () => collectAddonRows(descriptors, rowsByKey, dedup),
    [dedup, descriptors, rowsByKey],
  );

  const pendingDescriptors = useMemo(
    () =>
      descriptors.filter((_, index) => {
        const query = queries[index];
        if (!query) return true;
        if (query.data) return false;
        return query.isLoading || query.isPending || query.isFetching;
      }),
    [descriptors, queries],
  );

  return { addonRows, descriptors, pendingDescriptors };
}
