
CREATE OR REPLACE FUNCTION public.admin_rls_selftest(
  adv_id uuid, rev_id uuid, res_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  results jsonb := '[]'::jsonb;
  meas_id uuid;
  err_msg text;
  affected int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  BEGIN
    IF public.has_role(adv_id, 'adviseur') AND NOT public.has_role(res_id, 'adviseur') THEN
      results := results || jsonb_build_object('name','has_role respecteert rolverdeling','passed',true);
    ELSE
      results := results || jsonb_build_object('name','has_role respecteert rolverdeling','passed',false,'detail','onverwacht');
    END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', adv_id::text, 'role','authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);

    BEGIN
      INSERT INTO public.in_measurement (captured_by, status, payload, snapshot_hash)
      VALUES (adv_id, 'draft', '{"selftest":true}'::jsonb, 'selftest-hash')
      RETURNING id INTO meas_id;
      results := results || jsonb_build_object('name','Adviseur kan eigen draft aanmaken','passed', meas_id IS NOT NULL);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
      results := results || jsonb_build_object('name','Adviseur kan eigen draft aanmaken','passed',false,'detail',err_msg);
    END;

    IF meas_id IS NOT NULL THEN
      BEGIN
        UPDATE public.in_measurement SET status = 'submitted' WHERE id = meas_id;
        results := results || jsonb_build_object('name','Adviseur kan draft naar submitted zetten','passed',true);
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
        results := results || jsonb_build_object('name','Adviseur kan draft naar submitted zetten','passed',false,'detail',err_msg);
      END;

      BEGIN
        UPDATE public.in_measurement SET status = 'approved' WHERE id = meas_id;
        results := results || jsonb_build_object('name','Adviseur kan NIET zelf approven','passed',false,'detail','transitie toegestaan');
      EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('name','Adviseur kan NIET zelf approven','passed',true);
      END;

      PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', rev_id::text, 'role','authenticated')::text, true);

      BEGIN
        UPDATE public.in_measurement SET status = 'approved' WHERE id = meas_id;
        results := results || jsonb_build_object('name','Reviewer kan submitted naar approved zetten','passed',true);
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
        results := results || jsonb_build_object('name','Reviewer kan submitted naar approved zetten','passed',false,'detail',err_msg);
      END;

      BEGIN
        UPDATE public.in_measurement SET status = 'draft' WHERE id = meas_id;
        results := results || jsonb_build_object('name','Approved kan NIET terug naar draft','passed',false,'detail','transitie toegestaan');
      EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('name','Approved kan NIET terug naar draft','passed',true);
      END;

      PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', res_id::text, 'role','authenticated')::text, true);

      BEGIN
        UPDATE public.in_measurement SET payload = '{"hacked":true}'::jsonb WHERE id = meas_id;
        GET DIAGNOSTICS affected = ROW_COUNT;
        IF affected = 0 THEN
          results := results || jsonb_build_object('name','Bewoner kan vreemd record NIET wijzigen','passed',true);
        ELSE
          results := results || jsonb_build_object('name','Bewoner kan vreemd record NIET wijzigen','passed',false,'detail','RLS liet update toe');
        END IF;
      EXCEPTION WHEN OTHERS THEN
        results := results || jsonb_build_object('name','Bewoner kan vreemd record NIET wijzigen','passed',true);
      END;
    END IF;

    RAISE EXCEPTION 'SELFTEST_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'SELFTEST_ROLLBACK' THEN
      results := results || jsonb_build_object('name','onverwachte fout','passed',false,'detail',SQLERRM);
    END IF;
  END;

  RETURN jsonb_build_object(
    'run_at', now(),
    'total', jsonb_array_length(results),
    'passed', (SELECT count(*) FROM jsonb_array_elements(results) e WHERE (e->>'passed')::boolean),
    'results', results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_rls_selftest(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_rls_selftest(uuid,uuid,uuid) TO authenticated, service_role;
