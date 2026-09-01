export type RequestSchedulerSnapshot = {
  active: number;
  queued: number;
  inFlight: number;
};

export type RequestScheduler = {
  schedule<T>(key: string, task: () => Promise<T>): Promise<T>;
  pauseFor(milliseconds: number, key: string): void;
  snapshot(): RequestSchedulerSnapshot;
};

type QueueEntry<T> = {
  key: string;
  task: () => Promise<T>;
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

export function createRequestScheduler(options: {
  concurrency: number;
  /** Minimum gap between task starts (ms). Serializes launch times, not in-flight overlap. */
  staggerMs?: number;
}): RequestScheduler {
  const concurrency = Math.floor(options.concurrency);
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    throw new RangeError("request scheduler concurrency must be at least 1");
  }
  const staggerMs = Math.max(0, Math.floor(options.staggerMs ?? 0));

  const queue: QueueEntry<unknown>[] = [];
  const inFlight = new Map<string, Promise<unknown>>();
  const pausedUntilByKey = new Map<string, number>();
  const pauseTimersByKey = new Map<string, ReturnType<typeof setTimeout>>();
  let active = 0;
  let staggerChain: Promise<void> = Promise.resolve();

  const waitForStagger = (): Promise<void> => {
    if (staggerMs <= 0) return Promise.resolve();
    const ticket = staggerChain.then(
      () => new Promise<void>((resolve) => setTimeout(resolve, staggerMs)),
    );
    staggerChain = ticket.catch(() => {});
    return ticket;
  };

  const isKeyPaused = (key: string): boolean => {
    const until = pausedUntilByKey.get(key);
    if (until == null) return false;
    if (Date.now() >= until) {
      pausedUntilByKey.delete(key);
      const timer = pauseTimersByKey.get(key);
      if (timer != null) {
        clearTimeout(timer);
        pauseTimersByKey.delete(key);
      }
      return false;
    }
    return true;
  };

  const armPauseTimer = (key: string) => {
    const until = pausedUntilByKey.get(key);
    if (until == null) return;
    const remaining = Math.max(0, until - Date.now());
    const existing = pauseTimersByKey.get(key);
    if (existing != null) clearTimeout(existing);
    pauseTimersByKey.set(
      key,
      setTimeout(() => {
        pauseTimersByKey.delete(key);
        pausedUntilByKey.delete(key);
        drain();
      }, remaining),
    );
  };

  const armPauseTimersForQueued = () => {
    const keys = new Set(queue.map((entry) => entry.key));
    for (const key of keys) {
      if (isKeyPaused(key)) armPauseTimer(key);
    }
  };

  const findNextRunnableIndex = (): number => {
    for (let i = 0; i < queue.length; i += 1) {
      if (!isKeyPaused(queue[i]!.key)) return i;
    }
    return -1;
  };

  const drain = () => {
    while (active < concurrency && queue.length > 0) {
      const index = findNextRunnableIndex();
      if (index < 0) {
        armPauseTimersForQueued();
        return;
      }

      const entry = queue.splice(index, 1)[0]!;
      active += 1;
      void (async () => {
        try {
          await waitForStagger();
          const value = await entry.task();
          active -= 1;
          if (inFlight.get(entry.key) === entry.promise) inFlight.delete(entry.key);
          drain();
          entry.resolve(value);
        } catch (error) {
          active -= 1;
          if (inFlight.get(entry.key) === entry.promise) inFlight.delete(entry.key);
          drain();
          entry.reject(error);
        }
      })();
    }

    if (queue.length > 0 && findNextRunnableIndex() < 0) {
      armPauseTimersForQueued();
    }
  };

  return {
    schedule<T>(key: string, task: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key) as Promise<T> | undefined;
      if (existing) return existing;

      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      const entry: QueueEntry<T> = { key, task, promise, resolve, reject };
      inFlight.set(key, promise);
      queue.push(entry as QueueEntry<unknown>);
      drain();
      return promise;
    },

    pauseFor(milliseconds: number, key: string): void {
      if (!key || !Number.isFinite(milliseconds) || milliseconds <= 0) return;
      const until = Date.now() + milliseconds;
      pausedUntilByKey.set(key, Math.max(pausedUntilByKey.get(key) ?? 0, until));
      armPauseTimer(key);
      drain();
    },

    snapshot(): RequestSchedulerSnapshot {
      return { active, queued: queue.length, inFlight: inFlight.size };
    },
  };
}
