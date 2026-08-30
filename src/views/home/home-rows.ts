import { createAddonCatalogFetcher, normalizeName, type AddonRow } from "@/lib/addons";
import {
  homeBuiltRowCacheKey,
  readHomeCatalogPlaceholder,
  writeHomeCatalogCache,
} from "@/lib/cache";
import { topMovies, topSeries, type Meta } from "@/lib/cinemeta";
import {
  jikanNewReleases,
  jikanTopAiring,
  jikanTopPopular,
  jikanUpcoming,
  stripFranchiseSuffix,
} from "@/lib/providers/jikan";
import { tmdbMovieRow, tmdbSeriesRow, tmdbTrending } from "@/lib/providers/tmdb";
import { type Settings } from "@/lib/settings";
import type { HomeRow, RowSpec } from "./home-types";

export const MAX_PER_ROW = 30;

export function buildTmdbSpecs(settings: Settings): RowSpec[] {
  const key = settings.tmdbKey;
  const region = settings.region;
  return [
    {
      key: "tmdb-trending-movies",
      type: "movie",
      name: "Trending This Week",
      fetcher: (p) => tmdbTrending(key, "movie", "week", p),
    },
    {
      key: "tmdb-now-playing",
      type: "movie",
      name: "In Theaters Now",
      noDedup: true,
      fetcher: (p) => tmdbMovieRow(key, "now_playing", region, p),
    },
    {
      key: "tmdb-popular-movies",
      type: "movie",
      name: "Popular Movies",
      fetcher: (p) => tmdbMovieRow(key, "popular", region, p),
    },
    {
      key: "tmdb-trending-tv",
      type: "series",
      name: "Trending Series",
      fetcher: (p) => tmdbTrending(key, "tv", "week", p),
    },
    {
      key: "tmdb-on-the-air",
      type: "series",
      name: "On The Air",
      noDedup: true,
      fetcher: (p) => tmdbSeriesRow(key, "on_the_air", p),
    },
    {
      key: "tmdb-popular-tv",
      type: "series",
      name: "Popular Series",
      fetcher: (p) => tmdbSeriesRow(key, "popular", p),
    },
    {
      key: "tmdb-top-rated-tv",
      type: "series",
      name: "Top Rated Series",
      fetcher: (p) => tmdbSeriesRow(key, "top_rated", p),
    },
    {
      key: "tmdb-top-rated-movies",
      type: "movie",
      name: "Top Rated Movies",
      fetcher: (p) => tmdbMovieRow(key, "top_rated", region, p),
    },
  ];
}

export function hydrateTmdbRowsFromCache(settings: Settings): HomeRow[] {
  const specs = buildTmdbSpecs(settings);
  const rows: HomeRow[] = [];
  for (const spec of specs) {
    const cached = readHomeCatalogPlaceholder(homeBuiltRowCacheKey("tmdb", spec.type, spec.key));
    if (!cached?.length) continue;
    rows.push({
      key: spec.key,
      type: spec.type,
      name: spec.name,
      metas: cached,
      page: 1,
      hasMore: true,
      noDedup: spec.noDedup,
      fetcher: spec.fetcher,
    });
  }
  return rows;
}

export async function buildTmdbRows(settings: Settings) {
  const specs = buildTmdbSpecs(settings);
  const firstPages = await Promise.all(specs.map((s) => s.fetcher(1).catch(() => [] as Meta[])));
  const rows: HomeRow[] = specs
    .map((spec, i) => {
      const metas = firstPages[i];
      if (metas.length > 0) {
        writeHomeCatalogCache(homeBuiltRowCacheKey("tmdb", spec.type, spec.key), metas, {
          name: spec.name,
          type: spec.type,
          rowKey: spec.key,
        });
      }
      return {
        key: spec.key,
        type: spec.type,
        name: spec.name,
        metas,
        page: 1,
        hasMore: metas.length > 0,
        noDedup: spec.noDedup,
        fetcher: spec.fetcher,
      };
    })
    .filter((r) => r.metas.length > 0);

  const byKey = (k: string) => rows.find((r) => r.key === k)?.metas ?? [];
  const hero = [
    byKey("tmdb-trending-movies")[0],
    byKey("tmdb-trending-tv")[0],
    byKey("tmdb-now-playing")[0],
    byKey("tmdb-on-the-air")[0],
  ].filter(Boolean) as Meta[];
  return { rows, hero };
}

const CINEMETA_ROW_DEFS: Array<{
  key: string;
  type: "movie" | "series";
  name: string;
  pick: (data: {
    movies: Meta[];
    series: Meta[];
    mDrama: Meta[];
    mComedy: Meta[];
    mAction: Meta[];
    mScifi: Meta[];
    mThriller: Meta[];
    mAnimation: Meta[];
    mHorror: Meta[];
    mRomance: Meta[];
    mAdventure: Meta[];
    mDocumentary: Meta[];
    mMystery: Meta[];
    mFantasy: Meta[];
    sDrama: Meta[];
    sComedy: Meta[];
    sCrime: Meta[];
  }) => Meta[];
}> = [
  {
    key: "cm-top-movies",
    type: "movie",
    name: "Top 10 on Stremio",
    pick: (d) => d.movies.slice(0, 10),
  },
  { key: "cm-popular", type: "movie", name: "Popular Movies", pick: (d) => d.movies.slice(10, 40) },
  { key: "cm-drama", type: "movie", name: "Top 10 Drama", pick: (d) => d.mDrama.slice(0, 10) },
  {
    key: "cm-trending-tv",
    type: "series",
    name: "Trending Series",
    pick: (d) => d.series.slice(0, 30),
  },
  { key: "cm-comedy", type: "movie", name: "Top 10 Comedy", pick: (d) => d.mComedy.slice(0, 10) },
  { key: "cm-action", type: "movie", name: "Action Hits", pick: (d) => d.mAction.slice(0, 30) },
  { key: "cm-scifi", type: "movie", name: "Sci-Fi & Fantasy", pick: (d) => d.mScifi.slice(0, 30) },
  { key: "cm-thriller", type: "movie", name: "Thrillers", pick: (d) => d.mThriller.slice(0, 30) },
  {
    key: "cm-animation",
    type: "movie",
    name: "Animated Movies",
    pick: (d) => d.mAnimation.slice(0, 30),
  },
  { key: "cm-horror", type: "movie", name: "Horror", pick: (d) => d.mHorror.slice(0, 30) },
  { key: "cm-romance", type: "movie", name: "Romance", pick: (d) => d.mRomance.slice(0, 30) },
  { key: "cm-adventure", type: "movie", name: "Adventure", pick: (d) => d.mAdventure.slice(0, 30) },
  {
    key: "cm-documentary",
    type: "movie",
    name: "Documentaries",
    pick: (d) => d.mDocumentary.slice(0, 30),
  },
  { key: "cm-mystery", type: "movie", name: "Mystery", pick: (d) => d.mMystery.slice(0, 30) },
  { key: "cm-fantasy", type: "movie", name: "Fantasy", pick: (d) => d.mFantasy.slice(0, 30) },
  { key: "cm-drama-tv", type: "series", name: "Drama Series", pick: (d) => d.sDrama.slice(0, 30) },
  {
    key: "cm-comedy-tv",
    type: "series",
    name: "Comedy Series",
    pick: (d) => d.sComedy.slice(0, 30),
  },
  { key: "cm-crime-tv", type: "series", name: "Crime Series", pick: (d) => d.sCrime.slice(0, 30) },
];

export function hydrateCinemetaRowsFromCache(): HomeRow[] {
  const rows: HomeRow[] = [];
  for (const def of CINEMETA_ROW_DEFS) {
    const cached = readHomeCatalogPlaceholder(homeBuiltRowCacheKey("cinemeta", def.type, def.key));
    if (!cached?.length) continue;
    rows.push({
      key: def.key,
      type: def.type,
      name: def.name,
      metas: cached,
      page: 1,
      hasMore: false,
    });
  }
  return rows;
}

export async function buildCinemetaRows() {
  const [
    movies,
    series,
    mDrama,
    mComedy,
    mAction,
    mScifi,
    mThriller,
    mAnimation,
    mHorror,
    mRomance,
    mAdventure,
    mDocumentary,
    mMystery,
    mFantasy,
    sDrama,
    sComedy,
    sCrime,
  ] = await Promise.all([
    topMovies().catch(() => [] as Meta[]),
    topSeries().catch(() => [] as Meta[]),
    topMovies("Drama").catch(() => [] as Meta[]),
    topMovies("Comedy").catch(() => [] as Meta[]),
    topMovies("Action").catch(() => [] as Meta[]),
    topMovies("Sci-Fi").catch(() => [] as Meta[]),
    topMovies("Thriller").catch(() => [] as Meta[]),
    topMovies("Animation").catch(() => [] as Meta[]),
    topMovies("Horror").catch(() => [] as Meta[]),
    topMovies("Romance").catch(() => [] as Meta[]),
    topMovies("Adventure").catch(() => [] as Meta[]),
    topMovies("Documentary").catch(() => [] as Meta[]),
    topMovies("Mystery").catch(() => [] as Meta[]),
    topMovies("Fantasy").catch(() => [] as Meta[]),
    topSeries("Drama").catch(() => [] as Meta[]),
    topSeries("Comedy").catch(() => [] as Meta[]),
    topSeries("Crime").catch(() => [] as Meta[]),
  ]);
  const make = (key: string, type: "movie" | "series", name: string, metas: Meta[]): HomeRow => ({
    key,
    type,
    name,
    metas,
    page: 1,
    hasMore: false,
  });
  const data = {
    movies,
    series,
    mDrama,
    mComedy,
    mAction,
    mScifi,
    mThriller,
    mAnimation,
    mHorror,
    mRomance,
    mAdventure,
    mDocumentary,
    mMystery,
    mFantasy,
    sDrama,
    sComedy,
    sCrime,
  };
  const rows: HomeRow[] = CINEMETA_ROW_DEFS.map((def) => {
    const metas = def.pick(data);
    if (metas.length > 0) {
      writeHomeCatalogCache(homeBuiltRowCacheKey("cinemeta", def.type, def.key), metas, {
        name: def.name,
        type: def.type,
        rowKey: def.key,
      });
    }
    return make(def.key, def.type, def.name, metas);
  }).filter((r) => r.metas.length > 0);
  const hero = [movies[0], series[0], mDrama[0], mComedy[0], mAction[0], mScifi[0]].filter(
    Boolean,
  ) as Meta[];
  return { rows, hero };
}

export async function buildAnimeHomeRows(): Promise<HomeRow[]> {
  const cleanMetas = (list: Meta[]): Meta[] =>
    list.map((m) => {
      const cleaned = stripFranchiseSuffix(m.name);
      return cleaned === m.name ? m : { ...m, name: cleaned };
    });
  const fetchMany = async (
    fn: (page: number) => Promise<Meta[]>,
    pages: number,
  ): Promise<Meta[]> => {
    const results = await Promise.all(
      Array.from({ length: pages }, (_, i) => fn(i + 1).catch(() => [] as Meta[])),
    );
    const seen = new Set<string>();
    const out: Meta[] = [];
    for (const list of results) {
      for (const m of list) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        out.push(m);
      }
    }
    return out;
  };
  try {
    const [airing, newest, popular, upcoming] = await Promise.all([
      fetchMany(jikanTopAiring, 3),
      fetchMany(jikanNewReleases, 3),
      fetchMany(jikanTopPopular, 3),
      fetchMany(jikanUpcoming, 3),
    ]);
    const out: HomeRow[] = [];
    if (airing.length >= 6) {
      out.push({
        key: "anime-airing",
        type: "series",
        name: "Trending Anime",
        metas: cleanMetas(airing).slice(0, 60),
        page: 3,
        hasMore: false,
        noDedup: true,
      });
    }
    if (newest.length >= 6) {
      out.push({
        key: "anime-new",
        type: "series",
        name: "New Anime Releases",
        metas: cleanMetas(newest).slice(0, 60),
        page: 3,
        hasMore: false,
        noDedup: true,
      });
    }
    if (popular.length >= 6) {
      out.push({
        key: "anime-popular",
        type: "series",
        name: "Popular Anime",
        metas: cleanMetas(popular).slice(0, 60),
        page: 3,
        hasMore: false,
        noDedup: true,
      });
    }
    if (upcoming.length >= 6) {
      out.push({
        key: "anime-upcoming",
        type: "series",
        name: "Upcoming Anime",
        metas: cleanMetas(upcoming).slice(0, 60),
        page: 3,
        hasMore: false,
        noDedup: true,
      });
    }
    return out;
  } catch {
    return [];
  }
}

const STREAMING_SERVICE_PATTERNS = [
  /\bnetflix\b/,
  /\bdisney\s*\+?\b/,
  /\bdisney\s*plus\b/,
  /\bhulu\b/,
  /\bprime\s*video\b/,
  /\bamazon\s*prime\b/,
  /\bapple\s*tv\s*\+?\b/,
  /\bappletv\b/,
  /\bhbo\s*max\b/,
  /\bmax\b/,
  /\bparamount\s*\+?\b/,
  /\bpeacock\b/,
  /\bstarz\b/,
  /\bshowtime\b/,
  /\bcrunchyroll\b/,
];

export function isStreamingServiceRow(name: string): boolean {
  const n = (name ?? "").toLowerCase();
  return STREAMING_SERVICE_PATTERNS.some((rx) => rx.test(n));
}

export function mergeRows(
  built: HomeRow[],
  addons: AddonRow[],
  opts: { dedup?: boolean } = {},
): HomeRow[] {
  const dedup = opts.dedup ?? true;
  const addonTypesByName = new Map<string, Set<string>>();
  for (const addon of addons) {
    const name = addon.name.trim().toLowerCase();
    const types = addonTypesByName.get(name) ?? new Set<string>();
    types.add(addon.type);
    addonTypesByName.set(name, types);
  }
  const seen = new Set<string>();
  const out: HomeRow[] = [];
  for (const r of built) {
    if (dedup) seen.add(normalizeName(r.name, r.type));
    out.push(r);
  }
  for (const a of addons) {
    if (dedup) {
      const key = normalizeName(a.name, a.type);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const step = a.metas.length;
    const more = a.more;
    const origin = a.metas[0]?.addonOrigin;
    const canPage = !!more && step > 0;
    const sameNameTypes = addonTypesByName.get(a.name.trim().toLowerCase());
    const name =
      sameNameTypes && sameNameTypes.size > 1
        ? `${a.name}: ${a.type === "movie" ? "Movies" : a.type === "series" ? "Series" : a.type}`
        : a.name;
    out.push({
      key: a.key,
      type: a.type as "movie" | "series",
      name,
      metas: a.metas,
      page: 1,
      hasMore: canPage,
      fetcher:
        canPage && more
          ? createAddonCatalogFetcher(more, {
              initialPageSize: step,
              mapMeta: origin ? (m) => ({ ...m, addonOrigin: origin }) : undefined,
            })
          : undefined,
    });
  }
  return out;
}
