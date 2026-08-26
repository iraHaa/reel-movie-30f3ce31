import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { CURATED_IMDB_IDS } from "@/lib/seed-data";

/**
 * One-time seeding endpoint for the shared movie_cache table.
 *
 * Runs on the server where the Supabase service-role credentials are fully
 * active, so it works even when the raw SUPABASE_SERVICE_ROLE_KEY is not
 * available locally (e.g. on Lovable-managed deployments).
 *
 * The full curated list takes ~10 minutes at OMDb's rate limit, so the work
 * is split into chunks via query params — call repeatedly, advancing `start`:
 *
 *   POST /api/seed?pass=run123&start=0&count=60
 *   POST /api/seed?pass=run123&start=60&count=60
 *   ...
 *
 * Each response includes a `nextHint` URL until the whole list is covered.
 * Rows already cached with complete metadata are skipped, so re-running any
 * chunk is cheap and never churns updated_at/sitemap lastmod.
 *
 * Query params:
 *   pass     (required) must equal SEED_PASS below — hardcoded because the
 *            deployment plan allows no custom environment secrets
 *   start    index into the curated list (default 0)
 *   count    ids to process this call (default 50, max 100)
 *   delayMs  pause between OMDb calls (default 1100, range 250-5000)
 *   dry      "1" = report the range without fetching or writing
 *
 * Env vars required on the server (injected by the platform):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * OMDb key falls back to FALLBACK_OMDB_KEY below when OMDB_API_KEY is not
 * configured on the deployment.
 *
 * SECURITY: this endpoint is a temporary one-time tool — delete this file
 * (src/routes/api.seed.ts) once seeding is complete.
 */

const OMDB = "https://www.omdbapi.com/";
const OMDB_FETCH_TIMEOUT_MS = 15_000;

/**
 * Temporary auth + key fallback: the deployment plan has no way to configure
 * custom environment secrets, so the pass phrase and the OMDb key are
 * hardcoded here. Delete this whole route once seeding is complete.
 */
const SEED_PASS = "run123";
const FALLBACK_OMDB_KEY = "c55aca96";

interface OmdbDetail {
  Response: string;
  Error?: string;
  Title?: string;
  Year?: string;
  Runtime?: string;
  Genre?: string;
  Director?: string;
  Actors?: string;
  Plot?: string;
  Poster?: string;
  imdbRating?: string;
  Type?: string;
  [key: string]: unknown;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
      console.warn(`[seed] ${imdbId} failed twice: ${(err as Error).message}`);
      return null;
    }
  }
  return null;
}

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...NO_CACHE_HEADERS, "Content-Type": "application/json" },
  });
}

async function handleSeed(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Use POST to trigger seeding." }, 405);
  }

  const url = new URL(request.url);
  const params = url.searchParams;

  if (params.get("pass") !== SEED_PASS) {
    return json({ error: "Invalid or missing pass." }, 401);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const omdbKey = process.env.OMDB_API_KEY || FALLBACK_OMDB_KEY;
  const missing = [
    ...(!supabaseUrl ? ["SUPABASE_URL"] : []),
    ...(!serviceKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];
  if (missing.length) {
    return json({ error: `Missing env var(s) on the server: ${missing.join(", ")}` }, 500);
  }

  const total = CURATED_IMDB_IDS.length;
  const start = Math.max(0, Math.floor(Number(params.get("start") ?? 0)) || 0);
  const count = Math.min(100, Math.max(1, Math.floor(Number(params.get("count") ?? 50)) || 50));
  const delayMs = Math.min(5000, Math.max(250, Number(params.get("delayMs") ?? 1100) || 1100));
  const dry = params.get("dry") === "1";

  if (start >= total) {
    return json({ done: true, total, start, message: "start is beyond the end of the list." });
  }
  const end = Math.min(total, start + count);
  const nextHint =
    end < total
      ? `POST /api/seed?pass=${SEED_PASS}&start=${end}&count=${count}&delayMs=${delayMs}`
      : null;

  if (dry) {
    return json({
      dryRun: true,
      total,
      range: `${start}..${end - 1}`,
      count: end - start,
      nextHint,
    });
  }

  const supabase = createClient(supabaseUrl!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let buffer: ReturnType<typeof toCacheRow>[] = [];
  let seeded = 0;
  let alreadyCached = 0;
  let notFound = 0;
  let failed = 0;

  async function flush() {
    if (!buffer.length) return;
    const batch = buffer;
    buffer = [];
    const { error } = await supabase.from("movie_cache").upsert(batch, { onConflict: "imdb_id" });
    if (error) {
      console.error(`[seed] batch upsert failed (${batch.length} rows): ${error.message}`);
      failed += batch.length;
    } else {
      seeded += batch.length;
    }
  }

  for (const imdbId of CURATED_IMDB_IDS.slice(start, end)) {
    // Skip titles the cache already holds with complete metadata.
    const { data: existing, error: probeError } = await supabase
      .from("movie_cache")
      .select("imdb_id, genres, overview, director, actors, runtime")
      .eq("imdb_id", imdbId)
      .maybeSingle();
    if (probeError) {
      console.error(`[seed] lookup failed for ${imdbId}: ${probeError.message}`);
      failed++;
      continue;
    }
    if (isCompleteRow(existing)) {
      alreadyCached++;
      continue;
    }

    const detail = await fetchOmdbWithRetry(imdbId, omdbKey, delayMs);
    if (!detail || detail.Response !== "True" || !detail.Title) {
      notFound++;
    } else {
      buffer.push(toCacheRow(imdbId, detail));
      if (buffer.length >= 25) await flush();
    }
    await sleep(delayMs);
  }
  await flush();

  return json({
    total,
    range: `${start}..${end - 1}`,
    seeded,
    alreadyCached,
    notFound,
    failed,
    nextHint,
  });
}

export const Route = createFileRoute("/api/seed")({
  server: {
    handlers: {
      POST: ({ request }) =>
        handleSeed(request).catch((err) =>
          json({ error: `Seeding failed: ${(err as Error).message}` }, 500),
        ),
    },
  },
});
