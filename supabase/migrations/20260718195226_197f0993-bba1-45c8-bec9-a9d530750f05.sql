
-- LISTS
CREATE TABLE public.lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  emoji text,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public','shared')),
  share_slug text UNIQUE,
  sort_mode text NOT NULL DEFAULT 'custom' CHECK (sort_mode IN ('custom','date_added','rating','alpha')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lists TO authenticated;
GRANT ALL ON public.lists TO service_role;
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;

-- LIST INVITES (created before policies that reference it)
CREATE TABLE public.list_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, invitee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.list_invites TO authenticated;
GRANT ALL ON public.list_invites TO service_role;
ALTER TABLE public.list_invites ENABLE ROW LEVEL SECURITY;

-- LIST ITEMS
CREATE TABLE public.list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  movie_id uuid NOT NULL REFERENCES public.movies(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, movie_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.list_items TO authenticated;
GRANT ALL ON public.list_items TO service_role;
ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;

-- POLICIES: lists
CREATE POLICY "Owner manages lists" ON public.lists FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public lists readable" ON public.lists FOR SELECT TO authenticated
  USING (visibility = 'public');
CREATE POLICY "Invited users can view shared lists" ON public.lists FOR SELECT TO authenticated
  USING (visibility = 'shared' AND EXISTS (
    SELECT 1 FROM public.list_invites li WHERE li.list_id = lists.id AND li.invitee_id = auth.uid()
  ));

-- POLICIES: list_invites
CREATE POLICY "Owner manages invites" ON public.list_invites FOR ALL
  USING (EXISTS (SELECT 1 FROM public.lists l WHERE l.id = list_invites.list_id AND l.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lists l WHERE l.id = list_invites.list_id AND l.user_id = auth.uid()));
CREATE POLICY "Invitees can view own invites" ON public.list_invites FOR SELECT TO authenticated
  USING (invitee_id = auth.uid());

-- POLICIES: list_items
CREATE POLICY "Owner manages list items" ON public.list_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.lists l WHERE l.id = list_items.list_id AND l.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lists l WHERE l.id = list_items.list_id AND l.user_id = auth.uid()));
CREATE POLICY "View items of visible lists" ON public.list_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lists l
    WHERE l.id = list_items.list_id
      AND (
        l.user_id = auth.uid()
        OR l.visibility = 'public'
        OR (l.visibility = 'shared' AND EXISTS (
          SELECT 1 FROM public.list_invites li WHERE li.list_id = l.id AND li.invitee_id = auth.uid()
        ))
      )
  ));

CREATE TRIGGER update_lists_updated_at BEFORE UPDATE ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX lists_user_id_idx ON public.lists(user_id);
CREATE INDEX lists_share_slug_idx ON public.lists(share_slug);
CREATE INDEX list_items_list_id_idx ON public.list_items(list_id);
CREATE INDEX list_items_movie_id_idx ON public.list_items(movie_id);
CREATE INDEX list_invites_list_id_idx ON public.list_invites(list_id);
CREATE INDEX list_invites_invitee_id_idx ON public.list_invites(invitee_id);

-- Helper functions for share-link access
CREATE OR REPLACE FUNCTION public.get_list_by_share_slug(_slug text)
RETURNS TABLE (
  id uuid, user_id uuid, title text, description text, emoji text,
  visibility text, share_slug text, sort_mode text,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, user_id, title, description, emoji, visibility, share_slug, sort_mode, created_at, updated_at
  FROM public.lists
  WHERE share_slug = _slug AND visibility IN ('shared','public');
$$;

CREATE OR REPLACE FUNCTION public.get_list_items_by_share_slug(_slug text)
RETURNS SETOF public.movies
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.*
  FROM public.list_items li
  JOIN public.lists l ON l.id = li.list_id
  JOIN public.movies m ON m.id = li.movie_id
  WHERE l.share_slug = _slug AND l.visibility IN ('shared','public')
  ORDER BY li.position ASC, li.added_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_list_by_share_slug(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_list_items_by_share_slug(text) TO anon, authenticated;
