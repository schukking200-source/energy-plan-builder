-- ============================================================
-- VOIP PLATFORM - provisioning foundation
-- Domein: voip_ tabellen voor bestel-, DID- en provisioningflow
-- ============================================================

CREATE TYPE public.voip_did_status AS ENUM (
  'available',
  'reserved',
  'assigned',
  'failed',
  'quarantine'
);

CREATE TYPE public.voip_order_status AS ENUM (
  'draft',
  'pending_payment',
  'paid',
  'provisioning',
  'active',
  'failed',
  'cancelled'
);

CREATE TYPE public.voip_provisioning_status AS ENUM (
  'queued',
  'running',
  'success',
  'failed',
  'rollback_required'
);

CREATE TYPE public.voip_step_status AS ENUM (
  'queued',
  'running',
  'success',
  'failed',
  'skipped'
);

CREATE TABLE public.voip_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_code TEXT NOT NULL UNIQUE,
  contact_email TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT voip_customers_code_format
    CHECK (customer_code ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$')
);

CREATE TABLE public.voip_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.voip_customers(id) ON DELETE CASCADE,
  tenant_code TEXT NOT NULL UNIQUE,
  routing_profile TEXT NOT NULL DEFAULT 'carrier-ha',
  default_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT voip_tenants_code_format
    CHECK (tenant_code ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$')
);

CREATE TABLE public.voip_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.voip_customers(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT voip_subscriptions_status_check
    CHECK (status IN ('trial','active','suspended','cancelled'))
);

CREATE TABLE public.voip_sip_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.voip_tenants(id) ON DELETE CASCADE,
  extension TEXT NOT NULL,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_secret_ref TEXT,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, extension),
  UNIQUE (tenant_id, username),
  CONSTRAINT voip_sip_accounts_extension_format
    CHECK (extension ~ '^[0-9]{2,10}$'),
  CONSTRAINT voip_sip_accounts_status_check
    CHECK (status IN ('active','disabled','failed'))
);

CREATE TABLE public.voip_did_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  did TEXT NOT NULL UNIQUE,
  trunk TEXT NOT NULL DEFAULT 'AMS',
  status public.voip_did_status NOT NULL DEFAULT 'available',
  assigned_tenant_id UUID REFERENCES public.voip_tenants(id) ON DELETE SET NULL,
  assigned_sip_account_id UUID REFERENCES public.voip_sip_accounts(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT voip_did_numbers_digits_only CHECK (did ~ '^[0-9]{8,15}$')
);

CREATE TABLE public.voip_did_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  did_number_id UUID NOT NULL REFERENCES public.voip_did_numbers(id) ON DELETE CASCADE,
  reservation_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  order_id UUID,
  created_by_ip TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT voip_did_reservations_status_check
    CHECK (status IN ('active','expired','converted','cancelled'))
);

CREATE UNIQUE INDEX voip_did_reservations_one_active_per_did
  ON public.voip_did_reservations(did_number_id)
  WHERE status = 'active';

CREATE TABLE public.voip_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES public.voip_customers(id) ON DELETE SET NULL,
  reservation_id UUID REFERENCES public.voip_did_reservations(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  tenant_code TEXT NOT NULL,
  did TEXT NOT NULL,
  extension TEXT NOT NULL,
  plan_code TEXT,
  status public.voip_order_status NOT NULL DEFAULT 'draft',
  payment_provider TEXT,
  payment_reference TEXT,
  amount_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'EUR',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT voip_orders_tenant_code_format
    CHECK (tenant_code ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  CONSTRAINT voip_orders_did_digits_only CHECK (did ~ '^[0-9]{8,15}$'),
  CONSTRAINT voip_orders_extension_format CHECK (extension ~ '^[0-9]{2,10}$'),
  CONSTRAINT voip_orders_amount_positive CHECK (amount_cents IS NULL OR amount_cents >= 0)
);

ALTER TABLE public.voip_did_reservations
  ADD CONSTRAINT voip_did_reservations_order_fk
  FOREIGN KEY (order_id) REFERENCES public.voip_orders(id) ON DELETE SET NULL;

CREATE TABLE public.voip_payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  order_id UUID REFERENCES public.voip_orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'received',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  UNIQUE (provider, provider_event_id),
  CONSTRAINT voip_payment_events_status_check
    CHECK (status IN ('received','processed','ignored','failed'))
);

CREATE TABLE public.voip_provisioning_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.voip_orders(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.voip_customers(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status public.voip_provisioning_status NOT NULL DEFAULT 'queued',
  current_step TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.voip_provisioning_logs (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.voip_provisioning_jobs(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  status public.voip_step_status NOT NULL,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.voip_watchdog_observations (
  id BIGSERIAL PRIMARY KEY,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  component TEXT NOT NULL,
  node TEXT NOT NULL,
  status TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  message TEXT,
  CONSTRAINT voip_watchdog_observations_status_check
    CHECK (status IN ('ok','warning','critical','unknown')),
  CONSTRAINT voip_watchdog_observations_severity_check
    CHECK (severity IN ('info','warning','critical'))
);

CREATE INDEX voip_orders_status_idx ON public.voip_orders(status);
CREATE INDEX voip_orders_reservation_idx ON public.voip_orders(reservation_id);
CREATE INDEX voip_did_numbers_status_idx ON public.voip_did_numbers(status);
CREATE INDEX voip_provisioning_jobs_status_idx ON public.voip_provisioning_jobs(status);
CREATE INDEX voip_provisioning_logs_job_idx ON public.voip_provisioning_logs(job_id, created_at);
CREATE INDEX voip_watchdog_observations_component_idx
  ON public.voip_watchdog_observations(component, node, observed_at DESC);

CREATE TRIGGER voip_customers_updated_at
  BEFORE UPDATE ON public.voip_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER voip_tenants_updated_at
  BEFORE UPDATE ON public.voip_tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER voip_subscriptions_updated_at
  BEFORE UPDATE ON public.voip_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER voip_sip_accounts_updated_at
  BEFORE UPDATE ON public.voip_sip_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER voip_did_numbers_updated_at
  BEFORE UPDATE ON public.voip_did_numbers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER voip_did_reservations_updated_at
  BEFORE UPDATE ON public.voip_did_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER voip_orders_updated_at
  BEFORE UPDATE ON public.voip_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER voip_provisioning_jobs_updated_at
  BEFORE UPDATE ON public.voip_provisioning_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.voip_reserve_did(
  _did TEXT,
  _trunk TEXT DEFAULT 'AMS',
  _expires_minutes INTEGER DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  did_row public.voip_did_numbers%ROWTYPE;
  reservation_row public.voip_did_reservations%ROWTYPE;
  reservation_token TEXT;
BEGIN
  IF _did IS NULL OR _did !~ '^[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'Invalid DID format';
  END IF;

  IF _expires_minutes IS NULL OR _expires_minutes < 1 OR _expires_minutes > 60 THEN
    RAISE EXCEPTION 'Reservation expiry must be between 1 and 60 minutes';
  END IF;

  INSERT INTO public.voip_did_numbers (did, trunk, status)
  VALUES (_did, COALESCE(NULLIF(_trunk, ''), 'AMS'), 'available')
  ON CONFLICT (did) DO NOTHING;

  SELECT *
  INTO did_row
  FROM public.voip_did_numbers
  WHERE did = _did
  FOR UPDATE;

  UPDATE public.voip_did_reservations
  SET status = 'expired'
  WHERE did_number_id = did_row.id
    AND status = 'active'
    AND expires_at <= now();

  IF did_row.status = 'reserved'
     AND NOT EXISTS (
       SELECT 1
       FROM public.voip_did_reservations
       WHERE did_number_id = did_row.id
         AND status = 'active'
         AND expires_at > now()
     ) THEN
    UPDATE public.voip_did_numbers
    SET status = 'available'
    WHERE id = did_row.id;
    did_row.status := 'available';
  END IF;

  SELECT *
  INTO reservation_row
  FROM public.voip_did_reservations
  WHERE did_number_id = did_row.id
    AND status = 'active'
    AND expires_at > now()
  LIMIT 1;

  IF did_row.status <> 'available' OR reservation_row.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'available', false,
      'did', did_row.did,
      'status', did_row.status,
      'reservation_id', reservation_row.reservation_token,
      'expires_at', reservation_row.expires_at
    );
  END IF;

  reservation_token := 'res_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.voip_did_reservations (
    did_number_id,
    reservation_token,
    expires_at
  )
  VALUES (
    did_row.id,
    reservation_token,
    now() + make_interval(mins => _expires_minutes)
  )
  RETURNING * INTO reservation_row;

  UPDATE public.voip_did_numbers
  SET status = 'reserved'
  WHERE id = did_row.id;

  RETURN jsonb_build_object(
    'available', true,
    'did', did_row.did,
    'status', 'reserved',
    'reservation_id', reservation_row.reservation_token,
    'expires_at', reservation_row.expires_at,
    'expires_in_minutes', _expires_minutes
  );
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.voip_customers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.voip_tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.voip_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.voip_sip_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.voip_did_numbers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.voip_did_reservations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.voip_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.voip_payment_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.voip_provisioning_jobs TO authenticated;
GRANT SELECT, INSERT ON public.voip_provisioning_logs TO authenticated;
GRANT SELECT, INSERT ON public.voip_watchdog_observations TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.voip_provisioning_logs_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.voip_watchdog_observations_id_seq TO authenticated;
GRANT EXECUTE ON FUNCTION public.voip_reserve_did(TEXT, TEXT, INTEGER) TO authenticated;

GRANT ALL ON public.voip_customers TO service_role;
GRANT ALL ON public.voip_tenants TO service_role;
GRANT ALL ON public.voip_subscriptions TO service_role;
GRANT ALL ON public.voip_sip_accounts TO service_role;
GRANT ALL ON public.voip_did_numbers TO service_role;
GRANT ALL ON public.voip_did_reservations TO service_role;
GRANT ALL ON public.voip_orders TO service_role;
GRANT ALL ON public.voip_payment_events TO service_role;
GRANT ALL ON public.voip_provisioning_jobs TO service_role;
GRANT ALL ON public.voip_provisioning_logs TO service_role;
GRANT ALL ON public.voip_watchdog_observations TO service_role;
GRANT ALL ON SEQUENCE public.voip_provisioning_logs_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.voip_watchdog_observations_id_seq TO service_role;
GRANT EXECUTE ON FUNCTION public.voip_reserve_did(TEXT, TEXT, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.voip_reserve_did(TEXT, TEXT, INTEGER) FROM PUBLIC, anon;

ALTER TABLE public.voip_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voip_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voip_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voip_sip_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voip_did_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voip_did_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voip_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voip_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voip_provisioning_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voip_provisioning_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voip_watchdog_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "VoIP operators read customers"
  ON public.voip_customers FOR SELECT TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]));
CREATE POLICY "VoIP operators write customers"
  ON public.voip_customers FOR ALL TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]));

CREATE POLICY "VoIP operators manage tenants"
  ON public.voip_tenants FOR ALL TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]));

CREATE POLICY "VoIP operators manage subscriptions"
  ON public.voip_subscriptions FOR ALL TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]));

CREATE POLICY "VoIP operators manage sip accounts"
  ON public.voip_sip_accounts FOR ALL TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]));

CREATE POLICY "VoIP operators manage did numbers"
  ON public.voip_did_numbers FOR ALL TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]));

CREATE POLICY "VoIP operators manage did reservations"
  ON public.voip_did_reservations FOR ALL TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]));

CREATE POLICY "VoIP operators manage orders"
  ON public.voip_orders FOR ALL TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]));

CREATE POLICY "VoIP operators manage payment events"
  ON public.voip_payment_events FOR ALL TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]));

CREATE POLICY "VoIP operators manage provisioning jobs"
  ON public.voip_provisioning_jobs FOR ALL TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]));

CREATE POLICY "VoIP operators read provisioning logs"
  ON public.voip_provisioning_logs FOR SELECT TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin','kwaliteitscommissie']::public.app_role[]));
CREATE POLICY "VoIP operators insert provisioning logs"
  ON public.voip_provisioning_logs FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]));

CREATE POLICY "VoIP operators manage watchdog observations"
  ON public.voip_watchdog_observations FOR ALL TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin','kwaliteitscommissie']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','adviesbureau_admin']::public.app_role[]));
