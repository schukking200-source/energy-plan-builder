
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.aud_events_block_mutation() SET search_path = public;

-- Revoke direct execute van publieke/anon rollen op security-definer functies.
-- has_role en current_user_has_any_role blijven beschikbaar voor 'authenticated'
-- omdat RLS-policies ze nodig hebben.
REVOKE EXECUTE ON FUNCTION public.aud_events_hash_chain() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aud_events_block_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_has_any_role(public.app_role[]) FROM PUBLIC, anon;
