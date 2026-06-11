import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/intake/")({
  head: () => ({ meta: [{ title: "Opnames — Isolatieplan Tool" }] }),
  component: IntakeList,
});

type Row = {
  id: string;
  object_ref: string | null;
  captured_at: string;
  status: string;
  source: string;
  evidence_level: string;
  scan_app: string | null;
  lidar_point_cloud_ref: string | null;
};

function IntakeList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("in_measurement")
        .select("id, object_ref, captured_at, status, source, evidence_level, scan_app, lidar_point_cloud_ref")
        .order("captured_at", { ascending: false })
        .limit(50);
      if (!error && data) setRows(data as Row[]);
      setLoading(false);
    })();
  }, []);

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Opnames</h1>
          <p className="text-sm text-muted-foreground">
            Web-PWA opnameformulier — schrijft naar <code>in_measurement</code> + bucket{" "}
            <code>lidar-scans</code>.
          </p>
        </div>
        <Button asChild>
          <Link to="/intake/new">
            <Plus className="mr-1 h-4 w-4" /> Nieuwe opname
          </Link>
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nog geen opnames</CardTitle>
            <CardDescription>Start je eerste opname via de knop hierboven.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="font-medium">
                      {r.object_ref ?? <span className="text-muted-foreground">geen BAG-id</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.captured_at).toLocaleString("nl-NL")}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{r.status}</Badge>
                  <Badge variant="secondary">{r.source}</Badge>
                  <Badge variant="secondary">bewijs: {r.evidence_level}</Badge>
                  {r.scan_app && <Badge>{r.scan_app}</Badge>}
                  {r.lidar_point_cloud_ref && <Badge variant="default">LiDAR</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
