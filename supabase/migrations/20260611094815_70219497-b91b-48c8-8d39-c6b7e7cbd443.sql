CREATE OR REPLACE FUNCTION public.in_measurement_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_reviewer boolean;
  is_capturer boolean;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  is_reviewer := public.current_user_has_any_role(
    ARRAY['kwaliteitscommissie','steekproef','admin']::app_role[]
  );
  is_capturer := (auth.uid() = OLD.captured_by);

  -- Toegestane transities
  IF OLD.status = 'draft' AND NEW.status = 'submitted' AND is_capturer THEN
    NULL;
  ELSIF OLD.status = 'submitted' AND NEW.status IN ('in_review','approved','rejected') AND is_reviewer THEN
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
  ELSIF OLD.status = 'in_review' AND NEW.status IN ('approved','rejected') AND is_reviewer THEN
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
  ELSE
    RAISE EXCEPTION 'Ongeldige statusovergang % -> % voor deze gebruiker', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS in_measurement_status_guard ON public.in_measurement;
CREATE TRIGGER in_measurement_status_guard
  BEFORE UPDATE OF status ON public.in_measurement
  FOR EACH ROW EXECUTE FUNCTION public.in_measurement_status_guard();