/**
 * Seed script: populates the shared `movie_cache` table with popular movies
 * and TV series so public pages (and the "You Might Also Like" section) have a
 * rich dataset to recommend from. Data now comes from the TMDB API.
 *
 * Pipeline:
 *   1. Collect title references (deduped) from:
 *      - TMDB bulk lists: popular + top rated movies, plus popular series.
 *        These yield TMDB ids directly (1 API call each to hydrate) and are the
 *        recommended way to reach the upper end of the 500-1000 range.
 *      - a curated embedded list of IMDb Top 250 titles, blockbusters and
 *        franchises (src/lib/seed-data.ts). These are IMDb ids, resolved to
 *        TMDB via /find.
 *      - optional: a newline/comma separated file of tt IMDb IDs (--file)
 *   2. For each reference, fetch full metadata (genres, cast, crew, posters,
 *      backdrops, IMDb id) from TMDB `/movie/{id}` or `/tv/{id}` with
 *      `append_to_response=credits`.
 *   3. Upsert rows into movie_cache in batches (onConflict: imdb_id). Rows
 *      already cached with complete metadata are skipped, so re-runs are cheap.
 *
 * Usage:
 *   npm run seed:movie-cache                     # bulk lists + curated list
 *   npm run seed:movie-cache -- --no-bulk        # curated IMDb list only
 *   npm run seed:movie-cache -- --file ids.txt   # + IMDb IDs from a file
 *   npm run seed:movie-cache -- --dry-run --limit 5
 *
 * Required env vars (in .env or the real environment):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TMDB_API_KEY
 *   (TMDB_API_KEY is the "API Read Access Token" (v4), sent as a Bearer header.)
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CURATED_IMDB_IDS } from "../src/lib/seed-data";
import {
  TMDB_POSTER_SIZE,
  TMDB_BACKDROP_SIZE,
  tmdbImageUrl,
  tmdbFetchSafe,
  fetchTmdbDetails,
  findTmdbByImdb,
  tmdbDisplayTitle,
  tmdbYear,
  type MediaType,
  type TmdbSearchResponse,
  type TmdbTitleDetails,
} from "../src/lib/tmdb";

type TmdbTarget = {
  imdbId?: string;
  tmdbId?: number;
  mediaType: MediaType;
};

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]) {
  const flags = {
    delayMs: 150, // TMDB tolerates ~50 req/s — stay well under it
    batchSize: 25,
    limit: Infinity as number,
    dryRun: false,
    noBulk: false,
    file: null as string | null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      return v;
    };
    switch (arg) {
      case "--delay-ms":
        flags.delayMs = Number(next());
        break;
      case "--batch-size":
        flags.batchSize = Number(next());
        break;
      case "--limit":
        flags.limit = Number(next());
        break;
      case "--dry-run":
        flags.dryRun = true;
        break;
      case "--no-bulk":
        flags.noBulk = true;
        break;
      case "--file":
        flags.file = next();
        break;
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  if (!Number.isFinite(flags.delayMs) || flags.delayMs < 0) throw new Error("Invalid --delay-ms");
  if (!Number.isFinite(flags.batchSize) || flags.batchSize < 1)
    throw new Error("Invalid --batch-size");
  return flags;
}

// ---------------------------------------------------------------------------
// Env loading (no dotenv dependency — tiny manual parser)
// ---------------------------------------------------------------------------

function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key]) continue; // real environment wins
    process.env[key] = m[2].replace(/^["']|["']$/g, "");
  }
}

// ---------------------------------------------------------------------------
// Reference sources
// ---------------------------------------------------------------------------

/** TMDB bulk lists → targets keyed by TMDB id (no /find round-trip needed). */
async function collectBulkTargets(): Promise<TmdbTarget[]> {
  const seen = new Set<string>();
  const targets: TmdbTarget[] = [];
  const addFromList = async (path: string, mediaType: MediaType, pages: number) => {
    for (let page = 1; page <= pages; page++) {
      const res = await tmdbFetchSafe<TmdbSearchResponse>(path, {
        language: "en-US",
        page,
      });
      if (!res?.results?.length) break;
      for (const item of res.results) {
        const key = `${mediaType}:${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        targets.push({ tmdbId: item.id, mediaType });
      }
      if (page >= (res.total_pages ?? page)) break;
    }
  };
  await addFromList("/movie/popular", "movie", 10);
  await addFromList("/movie/top_rated", "movie", 10);
  await addFromList("/tv/popular", "series", 5);
  console.log(`[tmdb] collected ${targets.length} titles from popular/top-rated lists`);
  return targets;
}

function readFileImdbIds(path: string): string[] {
  const raw = readFileSync(resolve(path), "utf8");
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => /^tt\d+$/.test(t));
}

// ---------------------------------------------------------------------------
// TMDB fetching → cache row mapping
// ---------------------------------------------------------------------------

/** Maps a TMDB detail payload onto every movie_cache column. */
function toCacheRow(d: TmdbTitleDetails, fallbackImdbId: string | undefined, mediaType: MediaType) {
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
    tmdb_id: d.id,
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
    raw: d,
  };
}

/** Same completeness rule as getMovieMeta(): genres + at least one detail field. */
function isCompleteRow(
  row: {
    genres: string[] | null;
    overview: string | null;
    director: string | null;
    actors: string | null;
    runtime: number | null;
  } | null,
): boolean {
  return (
    !!row &&
    Array.isArray(row.genres) &&
    row.genres.length > 0 &&
    (row.overview != null || row.director != null || row.actors != null || row.runtime != null)
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function formatEta(ms: number): string {
  const mins = Math.round(ms / 60_000);
  return mins < 1 ? "<1 min" : `~${mins} min`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  loadDotEnv();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tmdbKey = process.env.TMDB_API_KEY;
  const missing = [
    ...(!supabaseUrl ? ["SUPABASE_URL"] : []),
    ...(!serviceKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ...(!tmdbKey ? ["TMDB_API_KEY"] : []),
  ];
  if (missing.length) {
    console.error(`Missing required env var(s): ${missing.join(", ")}`);
    console.error(
      "Add them to .env (Supabase Dashboard > Settings > API for the service role key; themoviedb.org/settings/api for the TMDB Read Access Token).",
    );
    process.exit(1);
  }

  // --- collect candidate references -----------------------------------------
  const seenImdb = new Set<string>();
  const targets: TmdbTarget[] = [];

  if (!flags.noBulk) {
    for (const t of await collectBulkTargets()) targets.push(t);
  }

  const imdbIds = new Set<string>();
  if (flags.file) {
    for (const id of readFileImdbIds(flags.file)) imdbIds.add(id);
  }
  for (const id of CURATED_IMDB_IDS) imdbIds.add(id);
  for (const id of imdbIds) {
    if (seenImdb.has(id)) continue;
    seenImdb.add(id);
    targets.push({ imdbId: id, mediaType: "movie" });
  }

  let refs = targets;
  if (refs.length > flags.limit) refs = refs.slice(0, flags.limit);
  console.log(`Seeding movie_cache from ${refs.length} candidate titles`);
  console.log(
    `Delay between TMDB calls: ${flags.delayMs}ms → ETA ${formatEta(refs.length * flags.delayMs)}`,
  );
  if (flags.dryRun) {
    console.log("Dry run — nothing will be written.");
    return;
  }

  const supabase = createClient(supabaseUrl!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- fetch + upsert ---------------------------------------------------------
  const startedAt = Date.now();
  let buffer: ReturnType<typeof toCacheRow>[] = [];
  let upserted = 0;
  let skippedExisting = 0;
  let skippedInvalid = 0;
  let failed = 0;

  async function flush() {
    if (!buffer.length) return;
    const batch = buffer;
    buffer = [];
    const { error } = await supabase.from("movie_cache").upsert(batch, { onConflict: "imdb_id" });
    if (error) {
      console.error(`[supabase] batch upsert failed (${batch.length} rows): ${error.message}`);
      failed += batch.length;
    } else {
      upserted += batch.length;
    }
  }

  for (let i = 0; i < refs.length; i++) {
    const target = refs[i];

    // Resolve the IMDb id when the reference already has one so we can probe
    // the cache before spending a detail request.
    const imdbId = target.imdbId;
    let tmdbId = target.tmdbId;
    let mediaType = target.mediaType;

    if (imdbId) {
      const { data: existing, error: probeError } = await supabase
        .from("movie_cache")
        .select("imdb_id, genres, overview, director, actors, runtime")
        .eq("imdb_id", imdbId)
        .maybeSingle();
      if (probeError) {
        console.error(`[supabase] lookup failed for ${imdbId}: ${probeError.message}`);
        failed++;
        continue;
      }
      if (isCompleteRow(existing)) {
        skippedExisting++;
        continue;
      }
    }

    // Resolve tmdbId + mediaType if we only had an IMDb id.
    if (tmdbId === undefined) {
      if (!imdbId) {
        skippedInvalid++;
        continue;
      }
      const found = await findTmdbByImdb(imdbId);
      if (!found) {
        skippedInvalid++;
      } else {
        tmdbId = found.tmdbId;
        mediaType = found.mediaType;
      }
    }

    if (tmdbId !== undefined) {
      let detail: TmdbTitleDetails | null = null;
      try {
        detail = await fetchTmdbDetails(tmdbId, mediaType);
      } catch (err) {
        console.warn(`[tmdb] ${mediaType}:${tmdbId} failed: ${(err as Error).message}`);
        detail = null;
      }
      const row = detail && tmdbDisplayTitle(detail) ? toCacheRow(detail, imdbId, mediaType) : null;
      if (row && row.imdb_id) {
        seenImdb.add(row.imdb_id);
        buffer.push(row);
        if (buffer.length >= flags.batchSize) await flush();
      } else {
        skippedInvalid++;
      }
    }

    const done = i + 1;
    if (done % 25 === 0 || done === refs.length) {
      const elapsed = Date.now() - startedAt;
      const eta = (elapsed / done) * (refs.length - done);
      console.log(
        `[${done}/${refs.length}] +${upserted} seeded · ${skippedExisting} already cached · ` +
          `${skippedInvalid} invalid/not found · ${failed} failed · ETA ${formatEta(eta)}`,
      );
    }

    await sleep(flags.delayMs);
  }
  await flush();

  console.log("\nDone.");
  console.log(`  Seeded (inserted/refreshed): ${upserted}`);
  console.log(`  Already complete in cache:   ${skippedExisting}`);
  console.log(`  Not found on TMDB:           ${skippedInvalid}`);
  console.log(`  Failed:                      ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
