
-- ============================================================
-- IN_MEASUREMENT (intake / opname-flow)
-- ============================================================
CREATE TYPE public.measurement_source AS ENUM ('manual', 'measured', 'inferred', 'lidar_derived');
CREATE TYPE public.evidence_level AS ENUM ('low', 'medium', 'high');
CREATE TYPE public.measurement_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');
CREATE TYPE public.scan_app AS ENUM ('polycam', 'scaniverse', 'scanner3d_app', 'canvas', 'roomplan_native', 'manual', 'other');

CREATE TABLE public.in_measurement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_ref text,                              -- BAG-id placeholder tot Fase 2
  captured_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_geo_lat numeric(9,6),
  captured_geo_lng numeric(9,6),
  device_meta jsonb NOT NULL DEFAULT '{}'::jsonb,   -- model, iOS-versie, app-versie

  -- Gestructureerde opname (ISSO-velden komen in Fase 3 detail)
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- LiDAR / RoomPlan bridge
  lidar_point_cloud_ref text,                   -- pad in storage bucket lidar-scans
  roomplan_json jsonb,
  scan_app public.scan_app,
  scan_format text,                             -- usdz, ply, obj, e57, las, fbx
  scan_size_bytes bigint,

  -- Bronstatus + bewijskracht
  source public.measurement_source NOT NULL DEFAULT 'manual',
  evidence_level public.evidence_level NOT NULL DEFAULT 'low',

  -- Versie + hash snapshot
  version integer NOT NULL DEFAULT 1,
  snapshot_hash text,

  status public.measurement_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX in_measurement_captured_by_idx ON public.in_measurement(captured_by);
CREATE INDEX in_measurement_object_ref_idx  ON public.in_measurement(object_ref);
CREATE INDEX in_measurement_status_idx      ON public.in_measurement(status);

GRANT SELECT, INSERT, UPDATE ON public.in_measurement TO authenticated;
GRANT ALL ON public.in_measurement TO service_role;

ALTER TABLE public.in_measurement ENABLE ROW LEVEL SECURITY;

-- Opnemer leest eigen metingen
CREATE POLICY "Capturer reads own measurements"
ON public.in_measurement FOR SELECT TO authenticated
USING (auth.uid() = captured_by);

-- Reviewers (adviseur/kwaliteit/steekproef/admin) lezen alles
CREATE POLICY "Reviewers read all measurements"
ON public.in_measurement FOR SELECT TO authenticated
USING (public.current_user_has_any_role(ARRAY['adviseur','adviesbureau_admin','kwaliteitscommissie','steekproef','admin']::app_role[]));

-- Opnemer maakt eigen metingen aan
CREATE POLICY "Capturer inserts own measurements"
ON public.in_measurement FOR INSERT TO authenticated
WITH CHECK (auth.uid() = captured_by);

-- Opnemer wijzigt eigen draft, of reviewers wijzigen status
CREATE POLICY "Capturer updates own draft"
ON public.in_measurement FOR UPDATE TO authenticated
USING (auth.uid() = captured_by AND status = 'draft')
WITH CHECK (auth.uid() = captured_by);

CREATE POLICY "Reviewers update status"
ON public.in_measurement FOR UPDATE TO authenticated
USING (public.current_user_has_any_role(ARRAY['kwaliteitscommissie','steekproef','admin']::app_role[]))
WITH CHECK (public.current_user_has_any_role(ARRAY['kwaliteitscommissie','steekproef','admin']::app_role[]));

-- Alleen admin verwijdert
CREATE POLICY "Admin deletes measurements"
ON public.in_measurement FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_in_measurement_updated_at
BEFORE UPDATE ON public.in_measurement
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- STORAGE RLS: lidar-scans bucket
-- Pad-conventie: {user_id}/{measurement_id}/{filename}
-- ============================================================

-- Uploader plaatst alleen in eigen map
CREATE POLICY "Users upload own lidar scans"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'lidar-scans'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Uploader leest eigen scans
CREATE POLICY "Users read own lidar scans"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lidar-scans'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Reviewers lezen alle scans
CREATE POLICY "Reviewers read all lidar scans"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'lidar-scans'
  AND public.current_user_has_any_role(ARRAY['adviseur','adviesbureau_admin','kwaliteitscommissie','steekproef','admin']::app_role[])
);

-- Uploader update eigen scans (bv. metadata)
CREATE POLICY "Users update own lidar scans"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'lidar-scans'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Alleen admin verwijdert (immutability voor audit)
CREATE POLICY "Admin deletes lidar scans"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'lidar-scans'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);
