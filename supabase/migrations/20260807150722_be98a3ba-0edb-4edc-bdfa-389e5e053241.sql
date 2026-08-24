
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.follows TO anon;
GRANT SELECT ON public.movies TO anon;

CREATE POLICY "Public profiles readable by guests" ON public.profiles
FOR SELECT TO anon USING (is_public = true);

CREATE POLICY "Public profile movies readable by guests" ON public.movies
FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = movies.user_id AND p.is_public = true));

CREATE POLICY "Follows readable by guests" ON public.follows
FOR SELECT TO anon USING (true);
