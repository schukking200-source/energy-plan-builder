ALTER TABLE public.in_lidar_scan
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS file_format text;

ALTER TABLE public.in_lidar_scan
  ALTER COLUMN storage_path_usdz DROP NOT NULL,
  ALTER COLUMN storage_path_json DROP NOT NULL;

-- Backfill voor bestaande rijen
UPDATE public.in_lidar_scan
SET storage_path = storage_path_usdz,
    file_format = 'usdz'
WHERE storage_path IS NULL AND storage_path_usdz IS NOT NULL;

ALTER TABLE public.in_lidar_scan
  ADD CONSTRAINT in_lidar_scan_format_check
  CHECK (file_format IS NULL OR file_format IN ('usdz','glb','gltf','obj','ply'));