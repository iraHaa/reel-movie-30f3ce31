
-- Add user ownership + favorites to movies
ALTER TABLE public.movies ADD COLUMN user_id uuid;
ALTER TABLE public.movies ADD COLUMN is_favorite boolean NOT NULL DEFAULT false;

-- Drop existing rows (were public/demo, no owner) and enforce ownership
DELETE FROM public.movies WHERE user_id IS NULL;
ALTER TABLE public.movies ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.movies ADD CONSTRAINT movies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX movies_user_id_idx ON public.movies(user_id);

-- Replace permissive policies with owner-scoped ones
DROP POLICY IF EXISTS "Public can delete movies" ON public.movies;
DROP POLICY IF EXISTS "Public can insert movies" ON public.movies;
DROP POLICY IF EXISTS "Public can read movies" ON public.movies;
DROP POLICY IF EXISTS "Public can update movies" ON public.movies;

CREATE POLICY "Users read own movies" ON public.movies FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own movies" ON public.movies FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own movies" ON public.movies FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own movies" ON public.movies FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  bio text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
