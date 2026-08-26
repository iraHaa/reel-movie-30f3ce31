import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

const OMDB = "https://www.omdbapi.com/";
const IMDB_ID_RE = /^tt\d+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OmdbSearchResult = {
  imdbID: string;
  Title: string;
  Year: string;
  Poster: string;
  Type: "movie" | "series";
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
  imdb_rating: number | null;
  media_type: "movie" | "series";
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

function normalizeType(t?: string | null): "movie" | "series" {
  return t === "series" ? "series" : "movie";
}
function parseYear(y?: string | null): number | null {
  if (!y) return null;
  const m = y.match(/\d{4}/);
  return m ? Number(m[0]) : null;
}
function parseRuntime(r?: string | null): number | null {
  if (!r) return null;
  const m = r.match(/\d+/);
  return m ? Number(m[0]) : null;
}
function parseRating(r?: string | null): number | null {
  if (!r || r === "N/A") return null;
  const n = Number(r);
  return Number.isFinite(n) ? n : null;
}
function cleanPoster(p?: string | null): string | null {
  if (!p || p === "N/A") return null;
  return p;
}

export const searchMovies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ query: z.string().min(1).max(120) }))
  .handler(async ({ data, context }): Promise<OmdbSearchResult[]> => {
    const q = data.query.trim();
    const qLower = q.toLowerCase();

    // 1. Local cache lookup
    const { data: cached } = await context.supabase
      .from("movie_cache")
      .select("imdb_id, title, release_year, poster_url, media_type")
      .ilike("title", `%${q}%`)
      .limit(50);

    const cachedResults: OmdbSearchResult[] = (cached ?? []).map((c) => ({
      imdbID: c.imdb_id,
      Title: c.title,
      Year: c.release_year?.toString() ?? "",
      Poster: c.poster_url ?? "",
      Type: normalizeType((c as { media_type?: string }).media_type),
    }));

    // 2. OMDb lookup — always query at least page 1 so titles missing from the
    // cache (e.g. an exact-match series) can never be hidden by a rich cache.
    const strongCachedHits = cachedResults.filter((r) =>
      r.Title.toLowerCase().includes(qLower),
    ).length;
    const maxPages = strongCachedHits >= 8 ? 1 : 5;

    const MAX_OMDB_RESULTS = 50;
    let omdbResults: OmdbSearchResult[] = [];
    {
      const key = process.env.OMDB_API_KEY;
      if (key) {
        const seen = new Set<string>();
        let totalAvailable = Infinity;
        for (let page = 1; page <= maxPages; page++) {
          if (omdbResults.length >= MAX_OMDB_RESULTS) break;
          if ((page - 1) * 10 >= totalAvailable) break;

          try {
            const url = `${OMDB}?apikey=${key}&s=${encodeURIComponent(q)}&page=${page}`;
            const res = await fetch(url);
            if (!res.ok) break;
            const json = (await res.json()) as {
              Search?: OmdbSearchResult[];
              Response?: string;
              totalResults?: string;
            };
            if (json.Response === "False" || !json.Search?.length) break;
            const total = Number(json.totalResults);
            if (Number.isFinite(total)) totalAvailable = total;
            for (const r of json.Search) {
              const t = (r as unknown as { Type?: string }).Type;
              if (t !== "movie" && t !== "series") continue;
              if (seen.has(r.imdbID)) continue;
              seen.add(r.imdbID);
              omdbResults.push({
                imdbID: r.imdbID,
                Title: r.Title,
                Year: r.Year,
                Poster: cleanPoster(r.Poster) ?? "",
                Type: normalizeType(t),
              });
              if (omdbResults.length >= MAX_OMDB_RESULTS) break;
            }
          } catch {
            // network failure — fall back to what we have
            break;
          }
        }
      }
    }


    // 3. Insert new OMDb results into shared cache (full metadata is filled by getMovieMeta on demand)
    const cachedIds = new Set(cachedResults.map((r) => r.imdbID));
    const newOmdb = omdbResults.filter((r) => !cachedIds.has(r.imdbID));
    if (newOmdb.length > 0) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("movie_cache").upsert(
          newOmdb.map((r) => ({
            imdb_id: r.imdbID,
            title: r.Title,
            release_year: parseYear(r.Year),
            poster_url: r.Poster || null,
            media_type: r.Type,
          })),
          { onConflict: "imdb_id", ignoreDuplicates: true },
        );
      } catch {
        // cache write failure shouldn't block search
      }
    }

    // 4. Merge + dedupe by imdbID (prefer cached entries)
    const merged = new Map<string, OmdbSearchResult>();
    for (const r of cachedResults) merged.set(r.imdbID, r);
    for (const r of omdbResults) if (!merged.has(r.imdbID)) merged.set(r.imdbID, r);

    // 5. Sort: exact → starts-with → partial → newest year
    const rank = (r: OmdbSearchResult) => {
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
      .slice(0, MAX_OMDB_RESULTS);
  });

/**
 * Public (no auth required) lookup for the canonical /movie/{imdbId} page.
 * Reads only the shared movie cache — never hits OMDb — so SEO rendering
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
          "imdb_id, title, release_year, runtime, genres, overview, director, actors, poster_url, imdb_rating, media_type",
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
 * movie cache — never hits OMDb. Priority order:
 *   1. Titles sharing at least one genre with the current movie, best
 *      rated first (no popularity column exists, so imdb_rating ranks).
 *   2. If fewer than 5 genre matches exist, fill the remaining slots with
 *      random other cache entries so the row always shows 5 cards
 *      (or whatever the cache holds if it has fewer than 6 titles total).
 * The current movie is always excluded.
 */
export const getSimilarMovies = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      imdbId: z.string().regex(IMDB_ID_RE),
      genres: z.array(z.string().min(1).max(40)).max(10),
      limit: z.number().int().min(1).max(20).default(5),
    }),
  )
  .handler(async ({ data }): Promise<SimilarMovie[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const CARD_COLUMNS = "imdb_id, title, release_year, poster_url, imdb_rating";
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

    // 1. Primary match: shared genres, best rated first (nulls last).
    let matches: SimilarMovie[] = [];
    if (data.genres.length > 0) {
      const { data: rows } = await supabaseAdmin
        .from("movie_cache")
        .select(CARD_COLUMNS)
        .overlaps("genres", data.genres)
        .neq("imdb_id", data.imdbId)
        .order("imdb_rating", { ascending: false, nullsFirst: false })
        .limit(data.limit);
      matches = (rows ?? []).map(toCard);
    }
    if (matches.length >= data.limit) return matches;

    // 2. Fallback fill: other active cache entries in random order.
    const exclude = [data.imdbId, ...matches.map((m) => m.imdb_id)];
    const { data: candidates } = await supabaseAdmin
      .from("movie_cache")
      .select(CARD_COLUMNS)
      .not("imdb_id", "in", `(${exclude.join(",")})`)
      .limit(200);

    const pool = candidates ?? [];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return [...matches, ...pool.slice(0, data.limit - matches.length).map(toCard)];
  });

export const getMovieMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ imdbId: z.string().regex(/^tt\d+$/) }))
  .handler(async ({ data, context }): Promise<MovieMeta> => {
    // Cache hit?
    const { data: cached } = await context.supabase
      .from("movie_cache")
      .select("*")
      .eq("imdb_id", data.imdbId)
      .maybeSingle();

    // A cache row is only "complete" when the OMDb detail fields are populated.
    // searchMovies() upserts partial rows (title/year/poster only) so we must
    // not treat those as valid cache hits — otherwise every newly-added movie
    // is saved with empty genres/overview/etc. and falls back to "Drama".
    const isComplete = (row: typeof cached): boolean =>
      !!row &&
      Array.isArray(row.genres) && row.genres.length > 0 &&
      (row.overview != null || row.director != null || row.actors != null || row.runtime != null);

    if (cached && isComplete(cached)) {
      return {
        imdb_id: cached.imdb_id,
        title: cached.title,
        release_year: cached.release_year,
        runtime: cached.runtime,
        genres: cached.genres ?? [],
        overview: cached.overview,
        director: cached.director,
        actors: cached.actors,
        poster_url: cached.poster_url,
        imdb_rating: (cached as { imdb_rating: number | null }).imdb_rating ?? null,
        media_type: normalizeType((cached as { media_type?: string }).media_type),
      };
    }


    const key = process.env.OMDB_API_KEY;
    if (!key) throw new Error("OMDB_API_KEY not configured");
    const res = await fetch(
      `${OMDB}?apikey=${key}&i=${encodeURIComponent(data.imdbId)}&plot=full`,
    );
    if (!res.ok) throw new Error("OMDb request failed");
    const json = (await res.json()) as Record<string, string>;
    if (json.Response === "False") throw new Error(json.Error || "Title not found");

    const meta: MovieMeta = {
      imdb_id: data.imdbId,
      title: json.Title ?? "",
      release_year: parseYear(json.Year),
      runtime: parseRuntime(json.Runtime),
      genres: (json.Genre ?? "").split(",").map((g) => g.trim()).filter(Boolean),
      overview: json.Plot && json.Plot !== "N/A" ? json.Plot : null,
      director: json.Director && json.Director !== "N/A" ? json.Director : null,
      actors: json.Actors && json.Actors !== "N/A" ? json.Actors : null,
      poster_url: cleanPoster(json.Poster),
      imdb_rating: parseRating(json.imdbRating),
      media_type: normalizeType(json.Type),
    };

    // Upsert into cache with admin client
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("movie_cache").upsert({
      imdb_id: meta.imdb_id,
      title: meta.title,
      release_year: meta.release_year,
      runtime: meta.runtime,
      genres: meta.genres,
      overview: meta.overview,
      director: meta.director,
      actors: meta.actors,
      poster_url: meta.poster_url,
      imdb_rating: meta.imdb_rating,
      media_type: meta.media_type,
      raw: json,
    });

    return meta;
  });
