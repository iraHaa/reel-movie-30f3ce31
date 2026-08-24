
-- Add OMDb/Fanart fields to movies
ALTER TABLE public.movies
  ADD COLUMN IF NOT EXISTS imdb_id text,
  ADD COLUMN IF NOT EXISTS release_year integer,
  ADD COLUMN IF NOT EXISTS runtime integer,
  ADD COLUMN IF NOT EXISTS overview text,
  ADD COLUMN IF NOT EXISTS director text,
  ADD COLUMN IF NOT EXISTS actors text,
  ADD COLUMN IF NOT EXISTS poster_url text,
  ADD COLUMN IF NOT EXISTS backdrop_url text,
  ADD COLUMN IF NOT EXISTS genres text[];

CREATE INDEX IF NOT EXISTS movies_imdb_id_idx ON public.movies (imdb_id);

-- Shared metadata cache to avoid re-hitting OMDb/Fanart
CREATE TABLE IF NOT EXISTS public.movie_cache (
  imdb_id text PRIMARY KEY,
  title text NOT NULL,
  release_year integer,
  runtime integer,
  genres text[],
  overview text,
  director text,
  actors text,
  poster_url text,
  backdrop_url text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.movie_cache TO authenticated;
GRANT ALL ON public.movie_cache TO service_role;

ALTER TABLE public.movie_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read movie cache" ON public.movie_cache;
CREATE POLICY "Authenticated can read movie cache"
  ON public.movie_cache FOR SELECT
  TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS movie_cache_updated_at ON public.movie_cache;
CREATE TRIGGER movie_cache_updated_at
  BEFORE UPDATE ON public.movie_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
