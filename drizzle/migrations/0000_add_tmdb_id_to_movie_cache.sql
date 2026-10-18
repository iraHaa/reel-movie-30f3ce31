ALTER TABLE public.movie_cache ADD COLUMN tmdb_id integer;
CREATE INDEX movie_cache_tmdb_id_idx ON public.movie_cache (tmdb_id);
COMMENT ON COLUMN public.movie_cache.tmdb_id IS 'TMDB numeric id for the cached title; authoritative key for TMDB lookups, imdb_id remains the public/external id.';