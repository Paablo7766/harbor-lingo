export type LockableTab = "discover" | "shows" | "library" | "addons";

export type LockableTabMeta = {
  key: LockableTab;
  label: string;
  iconKey: "discover" | "shows" | "library" | "addons";
};

export const LOCKABLE_TABS: LockableTabMeta[] = [
  { key: "discover", label: "Discover", iconKey: "discover" },
  { key: "shows", label: "Shows", iconKey: "shows" },
  { key: "library", label: "My Library", iconKey: "library" },
  { key: "addons", label: "Addons", iconKey: "addons" },
];

export type HiddenTabs = Record<LockableTab, boolean>;

export const DEFAULT_HIDDEN: HiddenTabs = {
  discover: false,
  shows: false,
  library: false,
  addons: false,
};

export function anyTabLocked(tabs: HiddenTabs | null | undefined): boolean {
  if (!tabs) return false;
  return Object.values(tabs).some(Boolean);
}
