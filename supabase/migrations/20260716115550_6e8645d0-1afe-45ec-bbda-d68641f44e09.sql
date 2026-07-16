ALTER TABLE public.movies ADD COLUMN IF NOT EXISTS watched_at date;
UPDATE public.movies SET watched_at = created_at::date WHERE watched_at IS NULL AND status = 'watched';
CREATE INDEX IF NOT EXISTS movies_user_watched_at_idx ON public.movies (user_id, watched_at);