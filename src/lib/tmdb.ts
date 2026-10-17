/**
 * Shared TMDB (The Movie Database) API helpers.
 *
 * Framework-agnostic (plain `fetch` + `process.env`) so it can be imported by
 * both the TanStack server functions (Cloudflare Workers runtime) and the
 * Node seed script (scripts/seed-movie-cache.ts).
 *
 * Authentication
 * --------------
 * TMDB's recommended method is an "API Read Access Token" (v4) sent as an
 * OAuth-style Bearer header. The token is a secret and lives ONLY in the
 * `TMDB_API_KEY` environment variable — never inlined, never prefixed with
 * `VITE_` (that would ship it to the browser). Get one at
 * https://www.themoviedb.org/settings/api
 *
 * Identifier note
 * ---------------
 * The Reel Movie app is keyed on IMDb ids (`tt\d+`) — they are the public
 * `/movie/{imdbId}` URL, the `movie_cache` primary key and the join column on
 * the personal `movies` table. TMDB search responses do NOT include `imdb_id`,
 * but TMDB *detail* responses (and `/find`) do, so `imdb_id` is resolved at the
 * detail step and the canonical IMDb URL is preserved unchanged.
 */

const TMDB_BASE = "https://api.themoviedb.org/3";
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

/** Poster/backdrop renditions we serve. `poster` cards are ~2:3, banners wide. */
export const TMDB_POSTER_SIZE = "w500";
export const TMDB_BACKDROP_SIZE = "w1280";

/** App media type. Kept in sync with the `movie_cache.media_type` / DB schema. */
export type MediaType = "movie" | "series";

/** Reads the secret per-call (Cloudflare Workers binds env at request time). */
export function tmdbToken(): string {
  const token = process.env['TMDB_API_KEY'];
  if (!token) throw new Error("Movie search is not configured. Add TMDB_API_KEY in Lovable Secrets.");
  return token;
}

export function hasTmdbToken(): boolean {
  return Boolean(process.env['TMDB_API_KEY']);
}

/** Builds an absolute image URL from a TMDB `*_path`, or null when absent. */
export function tmdbImageUrl(
  path: string | null | undefined,
  size: string = TMDB_POSTER_SIZE,
): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

type TmdbParams = Record<string, string | number | boolean | undefined | null>;

/** GET a TMDB endpoint with the Bearer token. Throws on non-2xx / missing config. */
export async function tmdbFetch<T>(path: string, params: TmdbParams = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  const token = tmdbToken();
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Unable to reach TMDB. Please try again later.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("TMDB credentials were rejected. Update TMDB_API_KEY in Lovable Secrets with an API Read Access Token.");
  }
  if (res.status === 404) throw new Error("Title not found in TMDB.");
  if (res.status === 429) throw new Error("TMDB is busy. Please try again shortly.");
  if (!res.ok) throw new Error("TMDB is temporarily unavailable. Please try again later.");
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error("TMDB returned an unreadable response. Please try again later.");
  }
}

/** GET a TMDB endpoint but resolve to `null` instead of throwing (best-effort). */
export async function tmdbFetchSafe<T>(path: string, params: TmdbParams = {}): Promise<T | null> {
  try {
    return await tmdbFetch<T>(path, params);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Response shapes (only the fields Reel Movie actually consumes)
// ---------------------------------------------------------------------------

export type TmdbGenre = { id: number; name: string };

export type TmdbSearchItem = {
  id: number;
  title?: string; // movie
  name?: string; // tv
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string | null; // movie
  first_air_date?: string | null; // tv
  overview?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
};

export type TmdbSearchResponse = {
  page: number;
  results: TmdbSearchItem[];
  total_pages: number;
  total_results: number;
};

export type TmdbCreditPerson = {
  id: number;
  name: string;
  job?: string;
  character?: string;
  profile_path?: string | null;
};

export type TmdbCredits = {
  cast?: TmdbCreditPerson[];
  crew?: TmdbCreditPerson[];
};

export type TmdbExternalIds = {
  imdb_id?: string | null;
  facebook_id?: string | null;
  twitter_id?: string | null;
};

/** Common fields across `/movie/{id}` and `/tv/{id}` detail responses. */
export type TmdbTitleDetails = {
  id: number;
  imdb_id?: string | null;
  title?: string; // movie
  name?: string; // tv
  original_title?: string;
  original_language?: string;
  release_date?: string | null; // movie
  first_air_date?: string | null; // tv
  status?: string; // tv
  homepage?: string | null;
  runtime?: number | null; // movie (minutes)
  episode_run_time?: number[]; // tv
  genres?: TmdbGenre[];
  overview?: string | null;
  tagline?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  credits?: TmdbCredits;
  external_ids?: TmdbExternalIds;
};

export type TmdbFindResponse = {
  movie_results: TmdbSearchItem[];
  tv_results: TmdbSearchItem[];
};

/**
 * Resolve an IMDb id (`tt\d+`) to a TMDB numeric id + media type via `/find`.
 * Prefers a movie match; falls back to a TV match. Returns null if TMDB has
 * no linked title (rare / very new entries).
 */
export async function findTmdbByImdb(
  imdbId: string,
  bestEffort = true,
): Promise<{ tmdbId: number; mediaType: MediaType } | null> {
  const request = bestEffort ? tmdbFetchSafe<TmdbFindResponse> : tmdbFetch<TmdbFindResponse>;
  const res = await request("/find/" + encodeURIComponent(imdbId), {
    external_source: "imdb_id",
  });
  if (!res) return null;
  const movie = res.movie_results?.[0];
  if (movie) return { tmdbId: movie.id, mediaType: "movie" };
  const tv = res.tv_results?.[0];
  if (tv) return { tmdbId: tv.id, mediaType: "series" };
  return null;
}

/**
 * Fetch full title details (genres, cast, crew, images) in one request using
 * `append_to_response`. `mediaType` selects the movie vs tv endpoint.
 */
export async function fetchTmdbDetails(
  tmdbId: number,
  mediaType: MediaType,
  bestEffort = true,
): Promise<TmdbTitleDetails | null> {
  const segment = mediaType === "series" ? "tv" : "movie";
  const request = bestEffort ? tmdbFetchSafe<TmdbTitleDetails> : tmdbFetch<TmdbTitleDetails>;
  return request(`/${segment}/${tmdbId}`, {
    language: "en-US",
    append_to_response: "credits,external_ids",
  });
}

/** "Movie" | "series" style app type from TMDB's tv/movie endpoint family. */
export function tmdbSegmentToMediaType(segment: "movie" | "tv"): MediaType {
  return segment === "tv" ? "series" : "movie";
}

/** Pick the display title regardless of movie (`title`) vs tv (`name`). */
export function tmdbDisplayTitle(d: { title?: string; name?: string }): string {
  return d.title || d.name || "";
}

/** Year (number) from TMDB `release_date` / `first_air_date`, or null. */
export function tmdbYear(d: {
  release_date?: string | null;
  first_air_date?: string | null;
}): number | null {
  const raw = d.release_date || d.first_air_date || "";
  const m = raw.match(/\d{4}/);
  return m ? Number(m[0]) : null;
}
