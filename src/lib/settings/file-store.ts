import { invoke } from "@tauri-apps/api/core";

export const isTauriSettingsEnv = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let pendingFlush: (() => Promise<void>) | null = null;

/** Register the live settings flush hook (SettingsProvider). */
export function bindSettingsFileFlush(fn: () => Promise<void>): () => void {
  pendingFlush = fn;
  return () => {
    if (pendingFlush === fn) pendingFlush = null;
  };
}

/** Flush debounced settings to disk — used on app close and page hide. */
export async function flushSettingsFileNow(): Promise<void> {
  await pendingFlush?.();
}

export async function readSettingsFile(): Promise<string | null> {
  if (!isTauriSettingsEnv) return null;
  try {
    return (await invoke<string | null>("settings_read")) ?? null;
  } catch {
    return null;
  }
}

export async function writeSettingsFile(content: string): Promise<void> {
  if (!isTauriSettingsEnv) return;
  try {
    await invoke("settings_write", { content });
  } catch {}
}
