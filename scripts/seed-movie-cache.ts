/**
 * One-time seed script: populates the shared `movie_cache` table with
 * ~500-1000 popular movies so public pages (and the "You Might Also Like"
 * section) have a rich dataset to recommend from.
 *
 * Pipeline:
 *   1. Collect IMDb IDs (deduped) from:
 *      - a curated embedded list of IMDb Top 250 titles, blockbusters and
 *        franchises across genres/eras
 *      - optional bulk source: TMDb popular + top rated lists (--tmdb-key).
 *        This is the recommended way to reach the upper end of the
 *        500-1000 range — 20 pages x 2 lists of real, existing titles.
 *      - optional: a newline/comma separated file of tt IDs (--file)
 *   2. For each ID, fetch full metadata from the OMDb API (with a delay
 *      between calls to respect rate limits; invalid/stale IDs return
 *      Response: "False" and are skipped).
 *   3. Upsert rows into movie_cache in batches (onConflict: imdb_id). Rows
 *      that are already cached with complete metadata are skipped, so the
 *      script is safe to re-run without duplicating or churning entries.
 *
 * Usage:
 *   npm run seed:movie-cache                            # curated list only
 *   npm run seed:movie-cache -- --tmdb-key <key>        # + TMDb bulk lists
 *   npm run seed:movie-cache -- --file ids.txt          # + IDs from a file
 *   npm run seed:movie-cache -- --dry-run --limit 5     # test a few IDs
 *
 * Required env vars (in .env or the real environment):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OMDB_API_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CURATED_IMDB_IDS } from "../src/lib/seed-data";

const OMDB = "https://www.omdbapi.com/";
const OMDB_FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]) {
  const flags = {
    delayMs: 1100, // OMDb free tier is ~1 req/s — stay safely under it
    batchSize: 25,
    limit: Infinity as number,
    dryRun: false,
    file: null as string | null,
    tmdbKey: null as string | null,
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
      case "--file":
        flags.file = next();
        break;
      case "--tmdb-key":
        flags.tmdbKey = next();
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
// IMDb ID sources
// ---------------------------------------------------------------------------

// The curated list lives in src/lib/seed-data.ts so the /api/seed server
// route seeds from the exact same source list. Any stale/wrong ID simply
// resolves to Response: "False" on OMDb and gets skipped — the list is
// safe by construction.

async function fetchTmdbImdbIds(apiKey: string): Promise<string[]> {
  const ids = new Set<string>();
  for (const list of ["popular", "top_rated"]) {
    for (let page = 1; page <= 10; page++) {
      const url = `https://api.themoviedb.org/3/movie/${list}?api_key=${apiKey}&language=en-US&page=${page}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`[tmdb] ${list} page ${page}: HTTP ${res.status} — stopping list`);
          break;
        }
        const json = (await res.json()) as { results?: { imdb_id?: string | null }[] };
        const found = (json.results ?? []).filter((r) => r.imdb_id).map((r) => r.imdb_id as string);
        found.forEach((id) => ids.add(id));
        if (!json.results?.length) break;
      } catch (err) {
        console.warn(`[tmdb] ${list} page ${page} failed: ${(err as Error).message}`);
        break;
      }
    }
  }
  console.log(`[tmdb] collected ${ids.size} IMDb IDs from popular + top rated lists`);
  return [...ids];
}

function readFileImdbIds(path: string): string[] {
  const raw = readFileSync(resolve(path), "utf8");
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => /^tt\d+$/.test(t));
}

// ---------------------------------------------------------------------------
// OMDb fetching + row mapping
// ---------------------------------------------------------------------------

interface OmdbDetail {
  Response: string;
  Error?: string;
  Title?: string;
  Year?: string;
  Rated?: string;
  Released?: string;
  Runtime?: string;
  Genre?: string;
  Director?: string;
  Writer?: string;
  Actors?: string;
  Plot?: string;
  Language?: string;
  Country?: string;
  Awards?: string;
  Poster?: string;
  BoxOffice?: string;
  imdbRating?: string;
  imdbVotes?: string;
  imdbID?: string;
  Type?: string;
  DVD?: string;
  Production?: string;
}

async function fetchOmdb(imdbId: string, apiKey: string): Promise<OmdbDetail> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OMDB_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${OMDB}?apikey=${apiKey}&i=${imdbId}&plot=full`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`OMDb HTTP ${res.status}`);
    return (await res.json()) as OmdbDetail;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOmdbWithRetry(
  imdbId: string,
  apiKey: string,
  delayMs: number,
): Promise<OmdbDetail | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await fetchOmdb(imdbId, apiKey);
    } catch (err) {
      if (attempt === 1) {
        await sleep(Math.max(delayMs, 2000));
        continue;
      }
      console.warn(`[omdb] ${imdbId} failed twice: ${(err as Error).message}`);
      return null;
    }
  }
  return null;
}

function parseYear(y?: string): number | null {
  const m = y?.match(/\d{4}/);
  return m ? Number(m[0]) : null;
}
function parseRuntime(r?: string): number | null {
  const m = r?.match(/\d+/);
  return m ? Number(m[0]) : null;
}
function parseRating(r?: string): number | null {
  if (!r || r === "N/A") return null;
  const n = Number(r);
  return Number.isFinite(n) ? n : null;
}
function clean(v?: string): string | null {
  return v && v !== "N/A" ? v : null;
}

/** Maps an OMDb payload onto every movie_cache column. */
function toCacheRow(imdbId: string, d: OmdbDetail) {
  return {
    imdb_id: imdbId,
    title: d.Title ?? "",
    release_year: parseYear(d.Year),
    runtime: parseRuntime(d.Runtime),
    genres: (d.Genre ?? "")
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean),
    overview: clean(d.Plot),
    director: clean(d.Director),
    actors: clean(d.Actors),
    poster_url: clean(d.Poster),
    backdrop_url: null, // OMDb has no backdrops — left null on purpose
    imdb_rating: parseRating(d.imdbRating),
    media_type: d.Type === "series" ? "series" : "movie",
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
  const omdbKey = process.env.OMDB_API_KEY;
  const missing = [
    ...(!supabaseUrl ? ["SUPABASE_URL"] : []),
    ...(!serviceKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ...(!omdbKey ? ["OMDB_API_KEY"] : []),
  ];
  if (missing.length) {
    console.error(`Missing required env var(s): ${missing.join(", ")}`);
    console.error(
      "Add them to .env (Supabase Dashboard > Settings > API for the service role key; omdbapi.com for the OMDb key).",
    );
    process.exit(1);
  }

  // --- collect candidate IMDb IDs -------------------------------------------
  const idSet = new Set<string>();
  if (flags.tmdbKey) {
    for (const id of await fetchTmdbImdbIds(flags.tmdbKey)) idSet.add(id);
  }
  if (flags.file) {
    const fromFile = readFileImdbIds(flags.file);
    console.log(`[file] collected ${fromFile.length} IMDb IDs from ${flags.file}`);
    for (const id of fromFile) idSet.add(id);
  }
  for (const id of CURATED_IMDB_IDS) idSet.add(id);

  let ids = [...idSet];
  if (ids.length > flags.limit) ids = ids.slice(0, flags.limit);
  console.log(`Seeding movie_cache from ${ids.length} candidate IMDb IDs`);
  console.log(
    `Delay between OMDb calls: ${flags.delayMs}ms → ETA ${formatEta(ids.length * flags.delayMs)}`,
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

  for (let i = 0; i < ids.length; i++) {
    const imdbId = ids[i];

    // Skip titles the cache already holds with complete metadata — keeps
    // re-runs cheap and avoids bumping updated_at (and sitemap lastmod) for
    // entries that don't need a refresh.
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

    const detail = await fetchOmdbWithRetry(imdbId, omdbKey!, flags.delayMs);
    if (!detail || detail.Response !== "True" || !detail.Title) {
      skippedInvalid++;
    } else {
      buffer.push(toCacheRow(imdbId, detail));
      if (buffer.length >= flags.batchSize) await flush();
    }

    const done = i + 1;
    if (done % 25 === 0 || done === ids.length) {
      const elapsed = Date.now() - startedAt;
      const eta = (elapsed / done) * (ids.length - done);
      console.log(
        `[${done}/${ids.length}] +${upserted} seeded · ${skippedExisting} already cached · ` +
          `${skippedInvalid} invalid/not found · ${failed} failed · ETA ${formatEta(eta)}`,
      );
    }

    await sleep(flags.delayMs);
  }
  await flush();

  console.log("\nDone.");
  console.log(`  Seeded (inserted/refreshed): ${upserted}`);
  console.log(`  Already complete in cache:   ${skippedExisting}`);
  console.log(`  Not found on OMDb:           ${skippedInvalid}`);
  console.log(`  Failed:                      ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
