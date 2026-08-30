/** Dynamic view chunks — imported on navigation (App lazy + router loaders). */

export const loadDiscover = () => import("@/views/discover");
export const loadShows = () => import("@/views/shows");
export const loadAddons = () => import("@/views/addons");
export const loadLibrary = () => import("@/views/library");
export const loadVod = () => import("@/views/playlist-vod");
export const loadDownloads = () => import("@/views/downloads");
export const loadWrapped = () => import("@/views/wrapped");

export const loadDetail = () => import("@/views/detail");
export const loadKidsDetail = () => import("@/views/kids-detail");
export const loadAward = () => import("@/views/award");
export const loadAnimeAward = () => import("@/views/anime-award");
export const loadFilter = () => import("@/views/filter");
export const loadGrid = () => import("@/views/grid");
export const loadPerson = () => import("@/views/person");
export const loadCollection = () => import("@/views/collection");
export const loadCollections = () => import("@/views/collections");
export const loadEpisodeDetail = () => import("@/views/episode-detail");
export const loadPlayPicker = () => import("@/views/play-picker");
export const loadPlayer = () => import("@/views/player");
export const loadQueue = () => import("@/views/queue");
export const loadService = () => import("@/views/service");

/** Path → chunk loader for tab routes (home/settings are eager — no entry). */
export const TAB_ROUTE_LOADERS: Record<string, () => Promise<unknown>> = {
  "/discover": loadDiscover,
  "/catalogs": loadDiscover,
  "/shows": loadShows,
  "/vod": loadVod,
  "/library": loadLibrary,
  "/downloads": loadDownloads,
  "/addons": loadAddons,
  "/wrapped": loadWrapped,
};
