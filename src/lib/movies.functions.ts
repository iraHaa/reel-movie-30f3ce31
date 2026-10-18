import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import {
  TMDB_POSTER_SIZE,
  TMDB_BACKDROP_SIZE,
  tmdbImageUrl,
  tmdbFetch,
  tmdbFetchSafe,
  fetchTmdbDetails,
  findTmdbByImdb,
  tmdbDisplayTitle,
  tmdbYear,
  hasTmdbToken,
  type MediaType,
  type TmdbSearchResponse,
  type TmdbSearchItem,
  type TmdbTitleDetails,
} from "@/lib/tmdb";

const IMDB_ID_RE = /^tt\d+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A single search hit. `imdbID` is the app's canonical public id, but TMDB
 * search responses do not carry it — so freshly-discovered titles ship with an
 * empty `imdbID` and a populated `tmdbId`, and the IMDb id is resolved later
 * when `getMovieMeta` fetches full details. Cached titles always have `imdbID`.
 */
export type MovieSearchResult = {
  imdbID: string;
  tmdbId?: number;
  Title: string;
  Year: string;
  Poster: string;
  Type: MediaType;
};

export type MovieMeta = {
  imdb_id: string;
  title: string;
  release_year: number | null;
  runtime: number | null;
  genres: string[];
  overview: string | null;
  director: string | null;
  actors: string | null;
  poster_url: string | null;
  backdrop_url: string | null;
  imdb_rating: number | null;
  media_type: MediaType;
};

/** Public movie payload served from the shared cache for /movie/{imdbId} pages. */
export type PublicMovie = MovieMeta & {
  updated_at: string | null;
  raw: Json | null;
};

/** Minimal card data for the "You Might Also Like" section on movie pages. */
export type SimilarMovie = {
  imdb_id: string;
  title: string;
  release_year: number | null;
  poster_url: string | null;
  imdb_rating: number | null;
};

export type PublicMovieLookup =
  | { status: "found"; movie: PublicMovie }
  | { status: "redirect"; imdbId: string }
  | { status: "not_found" };

function normalizeType(t?: string | null): MediaType {
  return t === "series" ? "series" : "movie";
}
function parseYear(y?: string | null): number | null {
  if (!y) return null;
  const m = y.match(/\d{4}/);
  return m ? Number(m[0]) : null;
}

/**
 * Maps a TMDB title-detail payload (movie or tv, with appended credits +
 * external ids) onto the app's MovieMeta shape. `imdb_id` comes straight from
 * the TMDB detail response, so the canonical IMDb URL is preserved.
 */
function mapTmdbDetailsToMeta(
  d: TmdbTitleDetails,
  fallbackImdbId: string,
  mediaType: MediaType,
): MovieMeta {
  const crew = d.credits?.crew ?? [];
  const director = crew
    .filter((c) => c.job === "Director")
    .map((c) => c.name)
    .slice(0, 2)
    .join(", ");
  const cast = d.credits?.cast ?? [];
  const actors = cast
    .map((c) => c.name)
    .filter(Boolean)
    .slice(0, 10)
    .join(", ");
  const runtime =
    mediaType === "series" ? (d.episode_run_time?.find((r) => r > 0) ?? null) : (d.runtime ?? null);
  return {
    imdb_id: d.imdb_id || fallbackImdbId || "",
    title: tmdbDisplayTitle(d),
    release_year: tmdbYear(d),
    runtime,
    genres: (d.genres ?? []).map((g) => g.name).filter(Boolean),
    overview: d.overview && d.overview.trim() ? d.overview.trim() : null,
    director: director || null,
    actors: actors || null,
    poster_url: tmdbImageUrl(d.poster_path, TMDB_POSTER_SIZE),
    backdrop_url: tmdbImageUrl(d.backdrop_path, TMDB_BACKDROP_SIZE),
    imdb_rating: typeof d.vote_average === "number" && d.vote_average > 0 ? d.vote_average : null,
    media_type: mediaType,
  };
}

export const searchMovies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ query: z.string().min(1).max(120) }))
  .handler(async ({ data, context }): Promise<MovieSearchResult[]> => {
    const q = data.query.trim();
    const qLower = q.toLowerCase();

    // 1. Local cache lookup — cached rows carry the canonical imdbID.
    const { data: cached } = await context.supabase
      .from("movie_cache")
      .select("imdb_id, title, release_year, poster_url, media_type")
      .ilike("title", `%${q}%`)
      .limit(50);

    const cachedResults: MovieSearchResult[] = (cached ?? []).map((c) => ({
      imdbID: c.imdb_id,
      Title: c.title,
      Year: c.release_year?.toString() ?? "",
      Poster: c.poster_url ?? "",
      Type: normalizeType((c as { media_type?: string }).media_type),
    }));

    // 2. TMDB lookup — query both movies and series so titles missing from the
    // cache can never be hidden by a rich local cache. TMDB search responses do
    // not include imdb_id, so fresh hits carry a tmdbId and an empty imdbID;
    // getMovieMeta resolves the IMDb id when the title is actually picked.
    const MAX_RESULTS = 50;
    const tmdbResults: MovieSearchResult[] = [];
    if (hasTmdbToken()) {
      const mapItem = (item: TmdbSearchItem, type: MediaType): MovieSearchResult => ({
        imdbID: "",
        tmdbId: item.id,
        Title: (item.title || item.name || "").trim(),
        Year: String(tmdbYear(item) ?? ""),
        Poster: tmdbImageUrl(item.poster_path, TMDB_POSTER_SIZE) ?? "",
        Type: type,
      });

      const seenTmdb = new Set<number>();
      const pushTmdb = (item: TmdbSearchItem, type: MediaType) => {
        if (seenTmdb.has(item.id)) return;
        seenTmdb.add(item.id);
        tmdbResults.push(mapItem(item, type));
      };

      // Fetch page 1 of each family concurrently; only pull follow-up movie
      // pages when the local cache is thin (mirrors the old OMDb heuristic).
      const strongCachedHits = cachedResults.filter((r) =>
        r.Title.toLowerCase().includes(qLower),
      ).length;
      const moviePages = strongCachedHits >= 8 ? 1 : 3;

      const first = await Promise.allSettled([
        tmdbFetch<TmdbSearchResponse>("/search/movie", {
          query: q,
          page: 1,
          include_adult: false,
        }),
        tmdbFetch<TmdbSearchResponse>("/search/tv", {
          query: q,
          page: 1,
          include_adult: false,
        }),
      ]);
      if (first.every((result) => result.status === "rejected") && cachedResults.length === 0) {
        const failed = first.find((result) => result.status === "rejected");
        throw new Error(failed?.status === "rejected" && failed.reason instanceof Error
          ? failed.reason.message : "Movie search is temporarily unavailable. Please try again later.");
      }
      const movieRes = first[0].status === "fulfilled" ? first[0].value : null;
      const tvRes = first[1].status === "fulfilled" ? first[1].value : null;
      if (movieRes) for (const it of movieRes.results ?? []) pushTmdb(it, "movie");
      if (tvRes) for (const it of tvRes.results ?? []) pushTmdb(it, "series");

      // Follow-up movie pages to enrich results toward MAX_RESULTS.
      const extraPages = [] as Promise<void>[];
      const totalPages = movieRes?.total_pages ?? 1;
      for (let page = 2; page <= Math.min(moviePages, totalPages); page++) {
        extraPages.push(
          (async () => {
            const res = await tmdbFetchSafe<TmdbSearchResponse>("/search/movie", {
              query: q,
              page,
              include_adult: false,
            });
            if (res) for (const it of res.results ?? []) pushTmdb(it, "movie");
          })(),
        );
      }
      await Promise.all(extraPages);
    } else if (cachedResults.length === 0) {
      throw new Error("Movie search is not configured. Add TMDB_API_KEY in Lovable Secrets.");
    }

    // 3. Merge + dedupe. Cached entries (with imdbID) win; cross-tier overlap
    // is detected by normalized title+year since TMDB hits lack an imdbID.
    const merged = new Map<string, MovieSearchResult>();
    const titleKey = (title: string, year: string) =>
      `${title.toLowerCase().trim()}::${year || ""}`;
    for (const r of cachedResults) merged.set(r.imdbID, r);
    const cachedTitleKeys = new Set(cachedResults.map((r) => titleKey(r.Title, r.Year)));
    for (const r of tmdbResults) {
      if (r.imdbID && merged.has(r.imdbID)) continue;
      if (cachedTitleKeys.has(titleKey(r.Title, r.Year))) continue;
      merged.set(`tmdb:${r.tmdbId}`, r);
      cachedTitleKeys.add(titleKey(r.Title, r.Year));
    }

    // 4. Sort: exact → starts-with → partial → newest year
    const rank = (r: MovieSearchResult) => {
      const t = r.Title.toLowerCase();
      if (t === qLower) return 0;
      if (t.startsWith(qLower)) return 1;
      if (t.includes(qLower)) return 2;
      return 3;
    };
    return Array.from(merged.values())
      .sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        return (parseYear(b.Year) ?? 0) - (parseYear(a.Year) ?? 0);
      })
      .slice(0, MAX_RESULTS);
  });

/**
 * Public (no auth required) lookup for the canonical /movie/{imdbId} page.
 * Reads only the shared movie cache — never hits TMDB — so SEO rendering
 * reuses cached data. Legacy /movie/{movieRowUuid} URLs resolve to the
 * movie's imdb_id and report a redirect so there is exactly one public URL
 * per title no matter how many users added it.
 */
export const getPublicMovie = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().min(2).max(64) }))
  .handler(async ({ data }): Promise<PublicMovieLookup> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (IMDB_ID_RE.test(data.id)) {
      const { data: row } = await supabaseAdmin
        .from("movie_cache")
        .select("*")
        .eq("imdb_id", data.id)
        .maybeSingle();
      if (!row) return { status: "not_found" };
      return {
        status: "found",
        movie: {
          imdb_id: row.imdb_id,
          title: row.title,
          release_year: row.release_year,
          runtime: row.runtime,
          genres: row.genres ?? [],
          overview: row.overview,
          director: row.director,
          actors: row.actors,
          poster_url: row.poster_url,
          backdrop_url: row.backdrop_url,
          imdb_rating: row.imdb_rating,
          media_type: normalizeType(row.media_type),
          updated_at: row.updated_at,
          raw: row.raw,
        },
      };
    }

    if (UUID_RE.test(data.id)) {
      // Legacy URL: a personal movies row id. Find its imdb_id and consolidate.
      const { data: entry } = await supabaseAdmin
        .from("movies")
        .select(
          "imdb_id, title, release_year, runtime, genres, overview, director, actors, poster_url, backdrop_url, imdb_rating, media_type",
        )
        .eq("id", data.id)
        .maybeSingle();

      if (entry?.imdb_id) {
        // Keep the shared cache as the single source of truth: backfill it
        // if this title was saved to a personal list before it was cached.
        const { data: cached } = await supabaseAdmin
          .from("movie_cache")
          .select("imdb_id")
          .eq("imdb_id", entry.imdb_id)
          .maybeSingle();
        if (!cached) {
          await supabaseAdmin.from("movie_cache").upsert(
            {
              imdb_id: entry.imdb_id,
              title: entry.title,
              release_year: entry.release_year,
              runtime: entry.runtime,
              genres: entry.genres,
              overview: entry.overview,
              director: entry.director,
              actors: entry.actors,
              poster_url: entry.poster_url,
              backdrop_url: entry.backdrop_url,
              imdb_rating: entry.imdb_rating,
              media_type: entry.media_type,
            },
            { onConflict: "imdb_id", ignoreDuplicates: true },
          );
        }
        return { status: "redirect", imdbId: entry.imdb_id };
      }
    }

    return { status: "not_found" };
  });

/**
 * "You Might Also Like" picks for a movie page, straight from the shared
 * movie cache — never hits TMDB. Candidates must share at least one genre
 * with the current movie and are then ranked by a relevance score:
 *   1. Number of shared genres (strict matching beats a single loose overlap).
 *   2. Shared director and shared cast members.
 *   3. Community (TMDB) rating only as a mild tie-breaker — never the primary signal.
 * To keep the row from being deterministic, the top-scoring ~25 candidates
 * are shuffled before picking 5, so each page view shows a varied but still
 * highly relevant selection.
 * If fewer than 5 scored matches exist, the remaining slots are filled with
 * random genre matches from the candidate pool, and only as a last resort
 * with random non-matching cache entries, so the row always shows 5 cards
 * (or whatever the cache holds if it has fewer than 6 titles total).
 * The current movie is always excluded from every pool.
 */
export const getSimilarMovies = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      imdbId: z.string().regex(IMDB_ID_RE),
      genres: z.array(z.string().min(1).max(40)).max(10),
      director: z.string().max(200).nullable().optional(),
      actors: z.string().max(600).nullable().optional(),
      limit: z.number().int().min(1).max(20).default(5),
    }),
  )
  .handler(async ({ data }): Promise<SimilarMovie[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const CANDIDATE_COLUMNS =
      "imdb_id, title, release_year, poster_url, imdb_rating, genres, director, actors";
    const toCard = (row: {
      imdb_id: string;
      title: string;
      release_year: number | null;
      poster_url: string | null;
      imdb_rating: number | null;
    }): SimilarMovie => ({
      imdb_id: row.imdb_id,
      title: row.title,
      release_year: row.release_year,
      poster_url: row.poster_url,
      imdb_rating: row.imdb_rating,
    });
    const splitNames = (value: string | null | undefined): string[] =>
      (value ?? "")
        .split(",")
        .map((n) => n.trim().toLowerCase())
        .filter((n) => n && n !== "n/a");
    const shuffle = <T>(arr: T[]): T[] => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    const targetGenres = new Set(data.genres.map((g) => g.toLowerCase()));
    const targetDirector = (data.director ?? "").trim().toLowerCase() || null;
    const targetActors = new Set(splitNames(data.actors));

    const scoreRow = (row: {
      genres: string[] | null;
      director: string | null;
      actors: string | null;
      imdb_rating: number | null;
    }): number => {
      let score = 0;
      // Shared genres weigh most — multi-genre matches rank strictly above
      // single-genre overlaps.
      for (const g of row.genres ?? []) {
        if (targetGenres.has(g.toLowerCase())) score += 3;
      }
      // Same director is a very strong signal.
      const directors = splitNames(row.director);
      if (targetDirector && directors.includes(targetDirector)) score += 4;
      // Shared cast members, capped so a single cameo can't dominate.
      let sharedActors = 0;
      for (const a of splitNames(row.actors)) {
        if (targetActors.has(a) && ++sharedActors >= 3) break;
      }
      score += sharedActors;
      // Mild quality tie-breaker only (0..1) — never the primary signal.
      score += (row.imdb_rating ?? 0) / 10;
      return score;
    };

    // 1. Candidate pool: cache titles sharing at least one genre, current
    //    movie excluded at the query level.
    let candidates: {
      imdb_id: string;
      title: string;
      release_year: number | null;
      poster_url: string | null;
      imdb_rating: number | null;
      genres: string[] | null;
      director: string | null;
      actors: string | null;
    }[] = [];
    if (targetGenres.size > 0) {
      const { data: rows } = await supabaseAdmin
        .from("movie_cache")
        .select(CANDIDATE_COLUMNS)
        .overlaps("genres", data.genres)
        .neq("imdb_id", data.imdbId)
        .limit(300);
      candidates = rows ?? [];
    }

    // 2. Rank by relevance score, then randomize within the top tier:
    //    shuffle the best-scored SHORTLIST_SIZE candidates and take the
    //    first few, so each page view gets a varied but still highly
    //    relevant selection instead of the same deterministic top N.
    const SHORTLIST_SIZE = 25;
    const ranked = candidates
      .map((row) => ({ row, score: scoreRow(row) }))
      .sort((a, b) => b.score - a.score);
    const shortlist = shuffle(ranked.slice(0, SHORTLIST_SIZE).map(({ row }) => row));
    const matches = shortlist.slice(0, data.limit).map(toCard);
    if (matches.length >= data.limit) return matches;

    // 3. Fallback fill, still genre-constrained: random picks from the
    //    remaining genre matches rather than the global top-rated list.
    const picked = new Set(matches.map((m) => m.imdb_id));
    const result = [...matches];
    const leftovers = shuffle(
      ranked.map(({ row }) => row).filter((row) => !picked.has(row.imdb_id)),
    );
    for (const row of leftovers) {
      if (result.length >= data.limit) break;
      result.push(toCard(row));
      picked.add(row.imdb_id);
    }
    if (result.length >= data.limit) return result;

    // 4. Last resort (tiny cache / no genres): random non-matching entries.
    const exclude = [data.imdbId, ...result.map((m) => m.imdb_id)];
    const { data: anyRows } = await supabaseAdmin
      .from("movie_cache")
      .select("imdb_id, title, release_year, poster_url, imdb_rating")
      .not("imdb_id", "in", `(${exclude.join(",")})`)
      .limit(200);

    const pool = shuffle(anyRows ?? []);
    return [...result, ...pool.slice(0, data.limit - result.length).map(toCard)];
  });

export const getMovieMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      // Either an IMDb id (`tt\d+`, the canonical public id) or a numeric TMDB id
      // (used for freshly-searched titles whose IMDb id isn't known yet).
      id: z.string().regex(/^(tt\d+|\d{1,10})$/),
      mediaType: z.enum(["movie", "series"]).optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<MovieMeta> => {
    const imdbId: string | null = /^tt\d+$/.test(data.id) ? data.id : null;
    let tmdbId: number | null = /^\d+$/.test(data.id) ? Number(data.id) : null;
    let mediaType: MediaType = data.mediaType ?? "movie";

    const toMeta = (row: Record<string, unknown>): MovieMeta => ({
      imdb_id: row.imdb_id as string,
      title: row.title as string,
      release_year: (row.release_year as number | null) ?? null,
      runtime: (row.runtime as number | null) ?? null,
      genres: (row.genres as string[] | null) ?? [],
      overview: (row.overview as string | null) ?? null,
      director: (row.director as string | null) ?? null,
      actors: (row.actors as string | null) ?? null,
      poster_url: (row.poster_url as string | null) ?? null,
      backdrop_url: (row.backdrop_url as string | null) ?? null,
      imdb_rating: (row.imdb_rating as number | null) ?? null,
      media_type: normalizeType(row.media_type as string | null | undefined),
    });

    // A cache row is only "complete" once the detail fields are populated. The
    // cache is keyed on imdb_id, so this fast path needs an IMDb id — freshly
    // searched TMDB titles resolve to an IMDb id (and are cached) on first fetch.
    if (imdbId) {
      const { data: cached } = await context.supabase
        .from("movie_cache")
        .select("*")
        .eq("imdb_id", imdbId)
        .maybeSingle();
      const isComplete =
        !!cached &&
        Array.isArray(cached.genres) &&
        cached.genres.length > 0 &&
        (cached.overview != null ||
          cached.director != null ||
          cached.actors != null ||
          cached.runtime != null);
      if (cached && isComplete) return toMeta(cached as unknown as Record<string, unknown>);
    }

    // Resolve a TMDB id when we only have an IMDb id.
    if (tmdbId === null) {
      if (!imdbId) throw new Error("Invalid movie id");
      const found = await findTmdbByImdb(imdbId, false);
      if (!found) throw new Error("Title not found in TMDB");
      tmdbId = found.tmdbId;
      mediaType = found.mediaType;
    }

    const details = await fetchTmdbDetails(tmdbId, mediaType, false);
    if (!details || !tmdbDisplayTitle(details)) throw new Error("Title not found in TMDB");
    const meta = mapTmdbDetailsToMeta(details, imdbId ?? "", mediaType);

    // Cache keyed on the canonical IMDb id. Titles TMDB has no IMDb id for
    // (rare) are still returned so they can be saved to a personal library —
    // they simply aren't shared-cached until an IMDb id exists.
    if (meta.imdb_id) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("movie_cache").upsert({
        imdb_id: meta.imdb_id,
        tmdb_id: tmdbId,
        title: meta.title,
        release_year: meta.release_year,
        runtime: meta.runtime,
        genres: meta.genres,
        overview: meta.overview,
        director: meta.director,
        actors: meta.actors,
        poster_url: meta.poster_url,
        backdrop_url: meta.backdrop_url,
        imdb_rating: meta.imdb_rating,
        media_type: meta.media_type,
        raw: details,
        updated_at: new Date().toISOString(),
      });
    }

    return meta;
  });

export type CacheRefreshReport = {
  scanned: number;
  refreshed: number;
  unmatched: number;
  failed: number;
  remaining: number;
};

/**
 * Migrates stale OMDb-era cache rows to TMDB data. Selects the oldest rows
 * that have no TMDB id (or a non-TMDB poster), resolves each through its
 * preserved IMDb id via TMDB `/find`, fetches full details (movie vs tv
 * endpoint by media_type) and upserts on the unchanged `imdb_id` key — so
 * personal library rows that reference IMDb ids keep working and reruns never
 * duplicate records. Best-effort per row: unmatched titles and API failures
 * are skipped and reported, never thrown. Idempotent: once a row carries a
 * TMDB id and TMDB image URLs it is never picked again.
 */
export const refreshMovieCache = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ batchSize: z.number().int().min(1).max(50).default(25) }))
  .handler(async ({ data }): Promise<CacheRefreshReport> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const staleFilter =
      "tmdb_id.is.null,poster_url.not.ilike.*image.tmdb.org*,poster_url.is.null";
    const { data: stale, error } = await supabaseAdmin
      .from("movie_cache")
      .select("imdb_id, media_type")
      .or(staleFilter)
      .order("updated_at", { ascending: true })
      .limit(data.batchSize);
    if (error) throw new Error("Could not read the movie cache.");

    const report: CacheRefreshReport = {
      scanned: stale?.length ?? 0,
      refreshed: 0,
      unmatched: 0,
      failed: 0,
      remaining: 0,
    };

    for (const row of stale ?? []) {
      try {
        const mediaType = normalizeType(row.media_type);
        const found = await findTmdbByImdb(row.imdb_id, true);
        if (!found) {
          report.unmatched++;
          continue;
        }
        const details = await fetchTmdbDetails(found.tmdbId, found.mediaType, true);
        if (!details || !tmdbDisplayTitle(details)) {
          report.unmatched++;
          continue;
        }
        const meta = mapTmdbDetailsToMeta(details, row.imdb_id, found.mediaType);
        if (!meta.imdb_id) meta.imdb_id = row.imdb_id;
        const { error: upError } = await supabaseAdmin.from("movie_cache").upsert(
          {
            imdb_id: meta.imdb_id,
            tmdb_id: found.tmdbId,
            title: meta.title,
            release_year: meta.release_year,
            runtime: meta.runtime,
            genres: meta.genres,
            overview: meta.overview,
            director: meta.director,
            actors: meta.actors,
            poster_url: meta.poster_url,
            backdrop_url: meta.backdrop_url,
            imdb_rating: meta.imdb_rating,
            media_type: mediaType,
            raw: details,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "imdb_id" },
        );
        if (upError) {
          report.failed++;
        } else {
          report.refreshed++;
          // Propagate refreshed metadata to every personal library /
          // watchlist row referencing this IMDb id. Only shared metadata is
          // updated — personal data (rating_score, notes, is_favorite,
          // status, watched_at) is never touched.
          await supabaseAdmin
            .from("movies")
            .update({
              title: meta.title,
              release_year: meta.release_year,
              runtime: meta.runtime,
              genres: meta.genres,
              overview: meta.overview,
              director: meta.director,
              actors: meta.actors,
              poster_url: meta.poster_url,
              backdrop_url: meta.backdrop_url,
              imdb_rating: meta.imdb_rating,
              media_type: mediaType,
            })
            .eq("imdb_id", meta.imdb_id);
        }
      } catch {
        report.failed++;
      }
    }

    const { count } = await supabaseAdmin
      .from("movie_cache")
      .select("imdb_id", { count: "exact", head: true })
      .or(staleFilter);
    report.remaining = count ?? 0;

    return report;
  });
