-- Public profiles are visible on the web (anon + authenticated) when is_public = true.
-- Private profiles and their movies remain owner-only.

ALTER TABLE public.profiles
  ALTER COLUMN is_public SET DEFAULT true;

-- Defense in depth: anon may read public rows via RLS, never write movies.
REVOKE INSERT, UPDATE, DELETE ON public.movies FROM anon;
GRANT SELECT ON public.movies TO anon;
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.follows TO anon;

DROP POLICY IF EXISTS "Public profiles readable" ON public.profiles;
CREATE POLICY "Public profiles readable"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

DROP POLICY IF EXISTS "Public profile movies readable" ON public.movies;
CREATE POLICY "Public profile movies readable"
  ON public.movies FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = movies.user_id AND p.is_public = true
    )
  );

DROP POLICY IF EXISTS "Public profile follows readable" ON public.follows;
CREATE POLICY "Public profile follows readable"
  ON public.follows FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.is_public = true
        AND (p.id = following_id OR p.id = follower_id)
    )
  );
