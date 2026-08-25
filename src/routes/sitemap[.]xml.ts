import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://reel-movie.lovable.app";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

/**
 * Public, indexable routes only.
 *
 * Excluded on purpose:
 * - /_authenticated/* (dashboard, profile, calendar, stats) — auth-gated
 * - /auth, /reset-password — auth flows, should not be indexed
 * - /api/* — server endpoints
 * - /sitemap.xml, /robots.txt — infra
 * - Any URL with query parameters
 *
 * Movie pages (/movie/{imdbId}) are added dynamically below from the shared
 * movie cache — never maintain them manually.
 *
 * When adding a new PUBLIC top-level route under src/routes/, add it here.
 */
const PUBLIC_ROUTES: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/discover", changefreq: "daily", priority: "0.8" },
];

/** Hard cap so we always stay under the sitemap protocol limit of 50k URLs. */
const MAX_MOVIE_URLS = 45000;

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const today = new Date().toISOString().split("T")[0];

        // One entry per title in the shared OMDb cache — the same source the
        // public movie pages render from.
        const movieEntries: SitemapEntry[] = [];
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("movie_cache")
            .select("imdb_id, updated_at")
            .order("updated_at", { ascending: false })
            .limit(MAX_MOVIE_URLS);
          for (const row of data ?? []) {
            movieEntries.push({
              path: `/movie/${row.imdb_id}`,
              lastmod: row.updated_at?.split("T")[0] ?? today,
              changefreq: "weekly",
              priority: "0.7",
            });
          }
        } catch (err) {
          // Sitemap must never fail completely — fall back to the static routes.
          console.error("[sitemap] failed to load movie cache", err);
        }

        const urls = [...PUBLIC_ROUTES, ...movieEntries]
          .filter((e) => !e.path.includes("?"))
          .map((e) => {
            const lastmod = e.lastmod ?? today;
            return [
              `  <url>`,
              `    <loc>${BASE_URL}${e.path}</loc>`,
              `    <lastmod>${lastmod}</lastmod>`,
              e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
              e.priority ? `    <priority>${e.priority}</priority>` : null,
              `  </url>`,
            ]
              .filter(Boolean)
              .join("\n");
          });

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
            "X-Robots-Tag": "noindex",
          },
        });
      },
    },
  },
});
