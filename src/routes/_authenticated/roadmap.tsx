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
import { AlertTriangle, CheckCircle2, Circle, Loader2 } from "lucide-react";
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
  owner: string | null;
  due_date: string | null;
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
        .order("phase", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Task[];
    },
  });

  const toggle = useMutation({
    mutationFn: async (t: Task) => {
      const next = t.status === "done" ? "open" : "done";
      const { error } = await supabase
        .from("roadmap_task")
        .update({ status: next })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roadmap_task"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const m = new Map<number, { label: string; items: Task[] }>();
    (tasks ?? []).forEach((t) => {
      if (!m.has(t.phase)) m.set(t.phase, { label: t.phase_label, items: [] });
      m.get(t.phase)!.items.push(t);
    });
    return Array.from(m.entries()).sort(([a], [b]) => a - b);
  }, [tasks]);

  const total = tasks?.length ?? 0;
  const done = tasks?.filter((t) => t.status === "done").length ?? 0;
  const pct = total ? (done / total) * 100 : 0;
  const blockers = tasks?.filter((t) => t.is_golive_blocker && t.status !== "done") ?? [];

  return (
    <AppShell>
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Roadmap naar go-live</CardTitle>
            <CardDescription>
              Levende takenlijst per projectblok. Lovable bouwt MVP 0 (blauw),
              enterprise-partij vervangt/levert de items met "Enterprise"-label.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Voortgang</span>
              <span className="text-muted-foreground">{done} / {total} taken</span>
            </div>
            <Progress value={pct} />
            {!canEdit && (
              <p className="text-xs text-muted-foreground">
                Alleen admin en kwaliteitscommissie kunnen items afvinken.
              </p>
            )}
          </CardContent>
        </Card>

        {blockers.length > 0 && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Blockers voor échte livegang ({blockers.length})
              </CardTitle>
              <CardDescription>
                Deze items moeten gereed zijn voordat het systeem productie kan draaien onder BIO2/ISO27001.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {blockers.map((b) => (
                <Badge key={b.id} variant="destructive" className="text-xs">{b.title}</Badge>
              ))}
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Roadmap laden…
          </div>
        )}

        {grouped.map(([phase, { label, items }]) => {
          const doneCount = items.filter((i) => i.status === "done").length;
          return (
            <Card key={phase}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {phase < 9 ? `Fase ${phase} — ${label}` : label}
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {doneCount} / {items.length}
                  </Badge>
                </div>
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
                          <span className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>
                            {t.title}
                          </span>
                          <Badge
                            variant={t.type === "enterprise" ? "secondary" : "outline"}
                            className="text-[10px]"
                          >
                            {t.type === "enterprise" ? "Enterprise (aanbesteding)" : "MVP 0 (Lovable)"}
                          </Badge>
                          {t.is_golive_blocker && (
                            <Badge variant="destructive" className="text-[10px]">go-live blocker</Badge>
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
