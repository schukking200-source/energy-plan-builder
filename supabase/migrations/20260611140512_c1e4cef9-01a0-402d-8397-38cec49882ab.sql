
CREATE OR REPLACE FUNCTION public.aud_events_hash_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  last_hash TEXT;
BEGIN
  SELECT record_hash INTO last_hash
  FROM public.aud_events
  ORDER BY id DESC LIMIT 1;

  NEW.prev_hash := last_hash;
  NEW.record_hash := encode(
    extensions.digest(
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
$function$;
