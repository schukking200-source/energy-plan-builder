
CREATE TYPE public.roadmap_status AS ENUM ('open','in_progress','done','blocker');
CREATE TYPE public.roadmap_type AS ENUM ('mvp0','enterprise');

CREATE TABLE public.roadmap_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase smallint NOT NULL,
  phase_label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  title text NOT NULL,
  description text,
  status public.roadmap_status NOT NULL DEFAULT 'open',
  type public.roadmap_type NOT NULL DEFAULT 'mvp0',
  is_golive_blocker boolean NOT NULL DEFAULT false,
  owner text,
  due_date date,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap_task TO authenticated;
GRANT ALL ON public.roadmap_task TO service_role;

ALTER TABLE public.roadmap_task ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ingelogde gebruikers kunnen roadmap lezen"
  ON public.roadmap_task FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin en kwaliteit kunnen roadmap bewerken"
  ON public.roadmap_task FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','kwaliteitscommissie']::app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','kwaliteitscommissie']::app_role[]));

CREATE POLICY "Admin kan roadmap-taken invoegen"
  ON public.roadmap_task FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin kan roadmap-taken verwijderen"
  ON public.roadmap_task FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER roadmap_task_set_updated_at
  BEFORE UPDATE ON public.roadmap_task
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
