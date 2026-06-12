
-- LiDAR-scans gekoppeld aan een opname (append-only, meerdere scans per opname mogelijk)
CREATE TABLE public.in_lidar_scan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_id uuid NOT NULL REFERENCES public.in_measurement(id) ON DELETE CASCADE,
  captured_by uuid NOT NULL DEFAULT auth.uid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  room_label text,
  storage_path_usdz text NOT NULL,
  storage_path_json text NOT NULL,
  size_bytes bigint,
  room_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  device_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX in_lidar_scan_measurement_idx ON public.in_lidar_scan(measurement_id);
CREATE INDEX in_lidar_scan_captured_by_idx ON public.in_lidar_scan(captured_by);

GRANT SELECT, INSERT ON public.in_lidar_scan TO authenticated;
GRANT ALL ON public.in_lidar_scan TO service_role;

ALTER TABLE public.in_lidar_scan ENABLE ROW LEVEL SECURITY;

-- Append-only: geen UPDATE/DELETE policies → automatisch geblokkeerd
CREATE POLICY "Eigen scans of reviewer ziet alles"
  ON public.in_lidar_scan FOR SELECT TO authenticated
  USING (
    captured_by = auth.uid()
    OR public.current_user_has_any_role(ARRAY['kwaliteitscommissie','steekproef','admin']::app_role[])
  );

CREATE POLICY "Alleen eigen scan uploaden"
  ON public.in_lidar_scan FOR INSERT TO authenticated
  WITH CHECK (
    captured_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.in_measurement m
      WHERE m.id = measurement_id AND m.captured_by = auth.uid() AND m.status = 'draft'
    )
  );

-- Storage policies voor de lidar-scans bucket (eerste pad-segment = user_id)
CREATE POLICY "lidar-scans: eigenaar upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lidar-scans'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "lidar-scans: eigenaar of reviewer leest"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'lidar-scans'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.current_user_has_any_role(ARRAY['kwaliteitscommissie','steekproef','admin']::app_role[])
    )
  );
