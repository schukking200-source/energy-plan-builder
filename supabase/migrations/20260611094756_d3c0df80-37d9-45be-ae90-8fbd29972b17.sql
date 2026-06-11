ALTER TYPE public.measurement_status ADD VALUE IF NOT EXISTS 'in_review' AFTER 'submitted';

ALTER TABLE public.in_measurement
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;