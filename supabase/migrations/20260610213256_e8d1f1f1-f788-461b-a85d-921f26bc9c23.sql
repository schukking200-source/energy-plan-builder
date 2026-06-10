
-- ============================================================
-- ISOLATIEPLAN TOOL — FASE 1: FOUNDATION
-- Logische compartimentering via tabelprefixen (id_/aud_)
-- Migratiepad: bij export naar Azure splitsbaar in 9 DB's
-- ============================================================

-- ---------- ROLES ENUM ----------
CREATE TYPE public.app_role AS ENUM (
  'bewoner',
  'adviseur',
  'adviesbureau_admin',
  'kwaliteitscommissie',
  'steekproef',
  'admin'
);

-- ---------- ID_PROFILES (identity-domein) ----------
CREATE TABLE public.id_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  organisation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.id_profiles TO authenticated;
GRANT ALL ON public.id_profiles TO service_role;
ALTER TABLE public.id_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON public.id_profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);
CREATE POLICY "Users update own profile"
  ON public.id_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile"
  ON public.id_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- ---------- USER_ROLES (least-privilege, geen escalation) ----------
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID REFERENCES auth.users(id),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Security-definer rolcheck (voorkomt recursieve RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_any_role(_roles public.app_role[])
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = ANY(_roles)
  )
$$;

-- Admins kunnen alle rollen zien
CREATE POLICY "Admins read all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------- AUD_EVENTS (append-only met hash-chain) ----------
CREATE TABLE public.aud_events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID REFERENCES auth.users(id),
  actor_role public.app_role,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash TEXT,
  record_hash TEXT NOT NULL
);
GRANT INSERT ON public.aud_events TO authenticated;
GRANT SELECT ON public.aud_events TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.aud_events_id_seq TO authenticated;
GRANT ALL ON public.aud_events TO service_role;
GRANT ALL ON SEQUENCE public.aud_events_id_seq TO service_role;
ALTER TABLE public.aud_events ENABLE ROW LEVEL SECURITY;

-- Alleen kwaliteitscommissie + admin mogen audit lezen
CREATE POLICY "Auditors read audit"
  ON public.aud_events FOR SELECT TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','kwaliteitscommissie','steekproef']::public.app_role[]));

-- Iedere ingelogde gebruiker mag audit-events insert via trigger
CREATE POLICY "Authenticated insert audit"
  ON public.aud_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_id OR actor_id IS NULL);

-- Trigger: bereken hash-chain bij insert, voorkom updates/deletes
CREATE OR REPLACE FUNCTION public.aud_events_hash_chain()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  last_hash TEXT;
BEGIN
  SELECT record_hash INTO last_hash
  FROM public.aud_events
  ORDER BY id DESC LIMIT 1;

  NEW.prev_hash := last_hash;
  NEW.record_hash := encode(
    digest(
      coalesce(last_hash, '') ||
      NEW.event_id::text ||
      NEW.occurred_at::text ||
      coalesce(NEW.actor_id::text, '') ||
      NEW.action ||
      NEW.resource_type ||
      coalesce(NEW.resource_id, '') ||
      NEW.payload::text,
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TRIGGER aud_events_hash_before_insert
  BEFORE INSERT ON public.aud_events
  FOR EACH ROW EXECUTE FUNCTION public.aud_events_hash_chain();

CREATE OR REPLACE FUNCTION public.aud_events_block_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'aud_events is append-only';
END;
$$;
CREATE TRIGGER aud_events_no_update BEFORE UPDATE ON public.aud_events
  FOR EACH ROW EXECUTE FUNCTION public.aud_events_block_mutation();
CREATE TRIGGER aud_events_no_delete BEFORE DELETE ON public.aud_events
  FOR EACH ROW EXECUTE FUNCTION public.aud_events_block_mutation();

-- ---------- AUTO-CREATE PROFILE + DEFAULT ROLE ON SIGNUP ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.id_profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'bewoner');

  INSERT INTO public.aud_events (actor_id, actor_role, action, resource_type, resource_id, payload)
  VALUES (NEW.id, 'bewoner', 'user.signup', 'auth.user', NEW.id::text,
          jsonb_build_object('email_domain', split_part(NEW.email, '@', 2)));

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- UPDATED_AT helper ----------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER id_profiles_updated_at
  BEFORE UPDATE ON public.id_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
