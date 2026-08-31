import type { RequestScheduler } from "./request-scheduler";

export const CATALOG_REQUEST_TIMEOUT_MS = 5_000;
/** First rows that fit on screen — fetched/mounted without idle deferral. */
export const INITIAL_VISIBLE_ROWS = 5;
/** Addon catalogs required before the startup splash may close (classic mode). */
export const MIN_SPLASH_ADDON_ROWS = 1;
const DEFERRED_STAGGER_MS = 40;

export function upsertOrdered<T extends { key: string }>(
  rows: T[],
  row: T,
  order: readonly string[],
): T[] {
  const next = rows.filter((item) => item.key !== row.key);
  next.push(row);
  const rank = (key: string) => {
    const index = order.indexOf(key);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  next.sort((a, b) => rank(a.key) - rank(b.key));
  return next;
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Catalog request timed out")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type ProgressiveRowTask<T> = {
  key: string;
  run: () => Promise<T | null>;
};

function deferAfterInitialViewport(
  launch: () => void,
  index: number,
  immediateCount: number,
): void {
  if (index < immediateCount) {
    launch();
    return;
  }
  const deferIndex = index - immediateCount;
  const timeout = 120 + deferIndex * DEFERRED_STAGGER_MS;
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(() => launch(), { timeout });
  } else {
    setTimeout(launch, deferIndex * DEFERRED_STAGGER_MS);
  }
}

/**
 * Loads catalog rows progressively: the first `immediateCount` tasks start right
 * away; the rest wait for idle/stagger so above-the-fold rows paint first.
 */
export async function runProgressiveRows<T extends { key: string }>(
  tasks: ProgressiveRowTask<T>[],
  order: readonly string[],
  opts: {
    scheduler: RequestScheduler;
    onRow: (row: T) => void;
    immediateCount?: number;
  },
): Promise<T[]> {
  if (tasks.length === 0) return [];
  const immediateCount = opts.immediateCount ?? INITIAL_VISIBLE_ROWS;
  const rank = (key: string) => {
    const index = order.indexOf(key);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  const ranked = [...tasks].sort((a, b) => rank(a.key) - rank(b.key));
  const results: T[] = [];

  const runOne = async (task: ProgressiveRowTask<T>) => {
    try {
      const row = await opts.scheduler.schedule(task.key, () =>
        withTimeout(task.run(), CATALOG_REQUEST_TIMEOUT_MS),
      );
      if (row) {
        results.push(row);
        opts.onRow(row);
      }
    } catch {
      void 0;
    }
  };

  await Promise.all(
    ranked.map(
      (task, index) =>
        new Promise<void>((resolve) => {
          const launch = () => void runOne(task).finally(resolve);
          deferAfterInitialViewport(launch, index, immediateCount);
        }),
    ),
  );

  return results;
}
