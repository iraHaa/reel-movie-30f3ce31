ALTER TABLE public.movies ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'movie';
ALTER TABLE public.movie_cache ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'movie';