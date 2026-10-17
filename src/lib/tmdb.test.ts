import { afterEach, expect, test } from "bun:test";
import { fetchTmdbDetails, tmdbFetch, tmdbFetchSafe, tmdbImageUrl } from "./tmdb";

const originalFetch = globalThis.fetch;
const originalToken = process.env['TMDB_API_KEY'];
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env['TMDB_API_KEY'];
  else process.env['TMDB_API_KEY'] = originalToken;
});

test("missing credentials fail before making a request", async () => {
  delete process.env['TMDB_API_KEY'];
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response(); }) as typeof fetch;
  await expect(tmdbFetch("/search/movie")).rejects.toThrow("Add TMDB_API_KEY");
  expect(called).toBe(false);
});

test("rejected credentials return a safe actionable error", async () => {
  process.env['TMDB_API_KEY'] = "test-fixture";
  globalThis.fetch = (async () => new Response(null, { status: 401 })) as typeof fetch;
  await expect(tmdbFetch("/search/movie")).rejects.toThrow("TMDB credentials were rejected");
});

test("network failures are sanitized and best-effort requests remain optional", async () => {
  process.env['TMDB_API_KEY'] = "test-fixture";
  globalThis.fetch = (async () => { throw new Error("raw transport failure"); }) as typeof fetch;
  await expect(tmdbFetch("/search/movie")).rejects.toThrow("Unable to reach TMDB");
  expect(await tmdbFetchSafe("/search/movie")).toBeNull();
});

test("strict series details preserve metadata and request appended credits", async () => {
  process.env['TMDB_API_KEY'] = "test-fixture";
  let requestedUrl = "";
  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return Response.json({ id: 1396, name: "Breaking Bad", vote_count: 123, poster_path: "/poster.jpg", backdrop_path: "/backdrop.jpg" });
  }) as typeof fetch;
  const details = await fetchTmdbDetails(1396, "series", false);
  expect(requestedUrl).toContain("/tv/1396");
  expect(new URL(requestedUrl).searchParams.get("append_to_response")).toBe("credits,external_ids");
  expect(details?.vote_count).toBe(123);
  expect(tmdbImageUrl(details?.poster_path)).toBe("https://image.tmdb.org/t/p/w500/poster.jpg");
  expect(tmdbImageUrl(details?.backdrop_path, "w1280")).toBe("https://image.tmdb.org/t/p/w1280/backdrop.jpg");
});