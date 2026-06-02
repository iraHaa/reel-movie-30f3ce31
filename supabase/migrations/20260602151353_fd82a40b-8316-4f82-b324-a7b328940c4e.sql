
CREATE TABLE public.movies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  genre TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'watched' CHECK (status IN ('watched','watchlist')),
  rating_score NUMERIC,
  rating_max NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.movies TO anon, authenticated;
GRANT ALL ON public.movies TO service_role;

ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read movies" ON public.movies FOR SELECT USING (true);
CREATE POLICY "Public can insert movies" ON public.movies FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update movies" ON public.movies FOR UPDATE USING (true);
CREATE POLICY "Public can delete movies" ON public.movies FOR DELETE USING (true);
