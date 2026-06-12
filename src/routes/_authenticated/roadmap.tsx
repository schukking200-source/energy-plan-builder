import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useMyRoles } from "@/lib/roles";
import { AlertTriangle, CheckCircle2, Circle, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/roadmap")({
  head: () => ({ meta: [{ title: "Roadmap naar go-live — Isolatieplan Tool" }] }),
  component: RoadmapPage,
});

type Task = {
  id: string;
  phase: number;
  phase_label: string;
  sort_order: number;
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "done" | "blocker";
  type: "mvp0" | "enterprise";
  is_golive_blocker: boolean;
  is_project_blocker: boolean;
  owner: string | null;
  due_date: string | null;
  module: string | null;
  module_label: string | null;
  module_order: number | null;
};

function RoadmapPage() {
  const qc = useQueryClient();
  const { roles } = useMyRoles();
  const canEdit = !!roles && (roles.includes("admin") || roles.includes("kwaliteitscommissie"));

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["roadmap_task"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roadmap_task")
        .select("*")
        .order("module_order", { ascending: true, nullsFirst: false })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Task[];
    },
  });

  const toggle = useMutation({
    mutationFn: async (t: Task) => {
      const next = t.status === "done" ? "open" : "done";
      const { error } = await supabase.from("roadmap_task").update({ status: next }).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roadmap_task"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Group by module (fallback to phase voor legacy items zonder module)
  const grouped = useMemo(() => {
    const m = new Map<string, { label: string; order: number; items: Task[] }>();
    (tasks ?? []).forEach((t) => {
      const key = t.module ?? `phase-${t.phase}`;
      const label = t.module_label ?? t.phase_label;
      const order = t.module_order ?? 100 + t.phase;
      if (!m.has(key)) m.set(key, { label, order, items: [] });
      m.get(key)!.items.push(t);
    });
    return Array.from(m.entries()).sort(([, a], [, b]) => a.order - b.order);
  }, [tasks]);

  const total = tasks?.length ?? 0;
  const done = tasks?.filter((t) => t.status === "done").length ?? 0;
  const pct = total ? (done / total) * 100 : 0;

  const projectBlockers = tasks?.filter((t) => t.is_project_blocker && t.status !== "done") ?? [];
  const projectBlockerTotal = tasks?.filter((t) => t.is_project_blocker).length ?? 0;
  const projectBlockerDone = projectBlockerTotal - projectBlockers.length;
  const lidarReady = projectBlockerTotal > 0 && projectBlockers.length === 0;

  const goliveBlockers =
    tasks?.filter((t) => t.is_golive_blocker && !t.is_project_blocker && t.status !== "done") ?? [];

  return (
    <AppShell>
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Roadmap per module</CardTitle>
            <CardDescription>
              Per blok opleveren. Eerst Module 0 (LiDAR) — zonder werkende LiDAR-pipeline op iOS
              stopt het hele project. Daarna de modules in volgorde.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Totale voortgang</span>
              <span className="text-muted-foreground">
                {done} / {total} taken
              </span>
            </div>
            <Progress value={pct} />
            {!canEdit && (
              <p className="text-xs text-muted-foreground">
                Alleen admin en kwaliteitscommissie kunnen items afvinken.
              </p>
            )}
          </CardContent>
        </Card>

        {projectBlockerTotal > 0 && (
          <Card
            className={
              lidarReady ? "border-primary/40 bg-primary/5" : "border-destructive bg-destructive/10"
            }
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert
                  className={`h-5 w-5 ${lidarReady ? "text-primary" : "text-destructive"}`}
                />
                {lidarReady
                  ? "LiDAR-pipeline werkt ✓ — project kan door"
                  : `Project-blocker: LiDAR / iOS (${projectBlockerDone}/${projectBlockerTotal})`}
              </CardTitle>
              <CardDescription
                className={lidarReady ? "" : "text-destructive-foreground/90 font-medium"}
              >
                {lidarReady
                  ? "Module 0 is volledig afgerond. De rest van het project kan veilig gebouwd worden."
                  : "Zonder werkende LiDAR-scan op iPhone Pro of iPad Pro heeft de rest van het systeem geen waarde. Alles wat hieronder staat wacht hierop."}
              </CardDescription>
            </CardHeader>
            {!lidarReady && (
              <CardContent>
                <Progress
                  value={(projectBlockerDone / projectBlockerTotal) * 100}
                  className="mb-3"
                />
                <div className="flex flex-wrap gap-2">
                  {projectBlockers.slice(0, 6).map((b) => (
                    <Badge key={b.id} variant="destructive" className="text-xs">
                      {b.title}
                    </Badge>
                  ))}
                  {projectBlockers.length > 6 && (
                    <Badge variant="outline" className="text-xs">
                      +{projectBlockers.length - 6} meer
                    </Badge>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {goliveBlockers.length > 0 && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Go-live blockers (Azure / BIO2) — {goliveBlockers.length}
              </CardTitle>
              <CardDescription>
                Nodig voor échte productie onder BIO2/ISO27001. Door enterprise-partij te leveren.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {goliveBlockers.map((b) => (
                <Badge key={b.id} variant="outline" className="border-amber-500/50 text-xs">
                  {b.title}
                </Badge>
              ))}
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Roadmap laden…
          </div>
        )}

        {grouped.map(([key, { label, items }], idx) => {
          const doneCount = items.filter((i) => i.status === "done").length;
          const moduleDone = doneCount === items.length;
          const isProjectBlockerModule = items.some((i) => i.is_project_blocker);
          const waitingOnLidar = !lidarReady && !isProjectBlockerModule;
          return (
            <Card
              key={key}
              className={isProjectBlockerModule && !lidarReady ? "border-destructive/40" : ""}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="text-muted-foreground text-xs font-mono">M{idx}</span>
                    {label}
                    {moduleDone && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {waitingOnLidar && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        wacht op LiDAR
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {doneCount} / {items.length}
                    </Badge>
                  </div>
                </div>
                <Progress value={(doneCount / items.length) * 100} className="mt-2 h-1" />
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((t) => {
                  const isDone = t.status === "done";
                  return (
                    <div
                      key={t.id}
                      className="flex items-start gap-3 rounded-md border bg-background p-3"
                    >
                      {canEdit ? (
                        <Checkbox
                          checked={isDone}
                          disabled={toggle.isPending}
                          onCheckedChange={() => toggle.mutate(t)}
                          className="mt-0.5"
                        />
                      ) : isDone ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                      ) : (
                        <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}
                          >
                            {t.title}
                          </span>
                          <Badge
                            variant={t.type === "enterprise" ? "secondary" : "outline"}
                            className="text-[10px]"
                          >
                            {t.type === "enterprise" ? "Enterprise" : "MVP 0"}
                          </Badge>
                          {t.is_project_blocker && (
                            <Badge variant="destructive" className="text-[10px]">
                              project-blocker
                            </Badge>
                          )}
                          {t.is_golive_blocker && !t.is_project_blocker && (
                            <Badge variant="outline" className="border-amber-500/50 text-[10px]">
                              go-live
                            </Badge>
                          )}
                          {t.status === "in_progress" && (
                            <Badge className="text-[10px]">bezig</Badge>
                          )}
                        </div>
                        {t.description && (
                          <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
