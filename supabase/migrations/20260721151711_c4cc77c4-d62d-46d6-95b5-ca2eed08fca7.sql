ALTER TABLE public.movies ADD COLUMN IF NOT EXISTS imdb_rating numeric;
ALTER TABLE public.movie_cache ADD COLUMN IF NOT EXISTS imdb_rating numeric;