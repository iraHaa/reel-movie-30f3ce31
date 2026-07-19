REVOKE ALL ON public.lists FROM anon;
REVOKE ALL ON public.list_items FROM anon;
REVOKE ALL ON public.list_invites FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lists TO authenticated;
GRANT ALL ON public.lists TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.list_items TO authenticated;
GRANT ALL ON public.list_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.list_invites TO authenticated;
GRANT ALL ON public.list_invites TO service_role;