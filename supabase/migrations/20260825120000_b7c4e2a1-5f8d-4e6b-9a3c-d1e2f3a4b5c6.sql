
-- Public movie pages (/movie/{imdbId}) render from the shared OMDb cache.
-- movie_cache holds only public movie metadata fetched from OMDb (title,
-- year, poster, plot, cast, ratings) — no user-specific data — so it is
-- safe for anonymous users and search-engine crawlers to read.
-- Private tables (movies, profiles, follows) keep their existing policies.

GRANT SELECT ON public.movie_cache TO anon;

DROP POLICY IF EXISTS "Movie cache readable by guests" ON public.movie_cache;
CREATE POLICY "Movie cache readable by guests"
  ON public.movie_cache FOR SELECT
  TO anon
  USING (true);
