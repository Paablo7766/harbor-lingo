const DB_NAME = "harbor-theme";
const DB_VERSION = 1;
const STORE = "kv";

const MARK = "logo-mark";
const WORDMARK = "logo-wordmark";
const APP = "logo-app-icon";

export type StoredLogos = {
  mark: string | null;
  wordmark: string | null;
  appIcon: string | null;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function scopeKey(base: string, profileId: string, linked: boolean): string {
  return linked ? `${base}:shared` : `${base}:${profileId}`;
}

async function kvGet(key: string): Promise<string | null> {
  const db = await openDB();
  if (!db) return null;
  try {
    return await new Promise<string | null>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function kvPut(key: string, data: string | null): Promise<boolean> {
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = data == null || data === "" ? store.delete(key) : store.put(data, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function loadLogos(profileId: string, linked: boolean): Promise<StoredLogos> {
  const [mark, wordmark, appIcon] = await Promise.all([
    kvGet(scopeKey(MARK, profileId, linked)),
    kvGet(scopeKey(WORDMARK, profileId, linked)),
    kvGet(scopeKey(APP, profileId, linked)),
  ]);
  return { mark, wordmark, appIcon };
}

export async function saveLogoMark(
  profileId: string,
  linked: boolean,
  data: string | null,
): Promise<boolean> {
  return kvPut(scopeKey(MARK, profileId, linked), data);
}

export async function saveLogoWordmark(
  profileId: string,
  linked: boolean,
  data: string | null,
): Promise<boolean> {
  return kvPut(scopeKey(WORDMARK, profileId, linked), data);
}

export async function saveAppIcon(
  profileId: string,
  linked: boolean,
  data: string | null,
): Promise<boolean> {
  return kvPut(scopeKey(APP, profileId, linked), data);
}

/** Move inline data URLs from settings JSON into IndexedDB (one-time migration). */
export async function migrateInlineLogos(
  profileId: string,
  linked: boolean,
  inline: { mark?: string; wordmark?: string; appIcon?: string },
): Promise<void> {
  const tasks: Promise<boolean>[] = [];
  if (inline.mark) tasks.push(saveLogoMark(profileId, linked, inline.mark));
  if (inline.wordmark) tasks.push(saveLogoWordmark(profileId, linked, inline.wordmark));
  if (inline.appIcon) tasks.push(saveAppIcon(profileId, linked, inline.appIcon));
  if (tasks.length > 0) await Promise.all(tasks);
}

export function mergeLogos(
  settings: {
    customLogoMark: string;
    customLogoWordmark: string;
    customAppIcon: string;
  },
  stored: StoredLogos,
): {
  customLogoMark: string;
  customLogoWordmark: string;
  customAppIcon: string;
} {
  return {
    customLogoMark: stored.mark ?? settings.customLogoMark ?? "",
    customLogoWordmark: stored.wordmark ?? settings.customLogoWordmark ?? "",
    customAppIcon: stored.appIcon ?? settings.customAppIcon ?? "",
  };
}

/** Load logos from IndexedDB and migrate any legacy inline data URLs. */
export async function hydrateLogosForSource<
  T extends {
    customLogoMark: string;
    customLogoWordmark: string;
    customAppIcon: string;
  },
>(base: T, profileId: string, linked: boolean): Promise<T> {
  const stored = await loadLogos(profileId, linked);
  let mark = stored.mark;
  let wordmark = stored.wordmark;
  let appIcon = stored.appIcon;

  if (!mark && base.customLogoMark) {
    mark = base.customLogoMark;
    await saveLogoMark(profileId, linked, mark);
  }
  if (!wordmark && base.customLogoWordmark) {
    wordmark = base.customLogoWordmark;
    await saveLogoWordmark(profileId, linked, wordmark);
  }
  if (!appIcon && base.customAppIcon) {
    appIcon = base.customAppIcon;
    await saveAppIcon(profileId, linked, appIcon);
  }

  return {
    ...base,
    customLogoMark: mark ?? "",
    customLogoWordmark: wordmark ?? "",
    customAppIcon: appIcon ?? "",
  };
}
