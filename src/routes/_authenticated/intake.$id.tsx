import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useMyRoles } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { LidarScanButton } from "@/components/LidarScanButton";

export const Route = createFileRoute("/_authenticated/intake/$id")({
  head: () => ({ meta: [{ title: "Opname-detail — Isolatieplan Tool" }] }),
  component: IntakeDetail,
});

type Row = {
  id: string;
  object_ref: string | null;
  captured_by: string;
  captured_at: string;
  captured_geo_lat: number | null;
  captured_geo_lng: number | null;
  device_meta: Record<string, unknown>;
  payload: Record<string, unknown>;
  source: string;
  evidence_level: string;
  status: string;
  scan_app: string | null;
  scan_format: string | null;
  scan_size_bytes: number | null;
  lidar_point_cloud_ref: string | null;
  snapshot_hash: string | null;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type LidarScanRow = {
  id: string;
  room_label: string | null;
  storage_path_usdz: string;
  storage_path_json: string;
  size_bytes: number | null;
  room_summary: {
    wallCount?: number;
    doorCount?: number;
    windowCount?: number;
    floorAreaM2?: number;
    ceilingHeightM?: number;
  };
  captured_at: string;
};

function IntakeDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { roles } = useMyRoles();
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [scans, setScans] = useState<LidarScanRow[]>([]);
  const [scanReload, setScanReload] = useState(0);

  const isReviewer = !!roles?.some((r) =>
    ["kwaliteitscommissie", "steekproef", "admin"].includes(r),
  );

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("in_measurement")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) toast.error(error.message);
      if (data) {
        setRow(data as unknown as Row);
        setNotes((data as { review_notes: string | null }).review_notes ?? "");
        if ((data as { lidar_point_cloud_ref: string | null }).lidar_point_cloud_ref) {
          const { data: signed } = await supabase.storage
            .from("lidar-scans")
            .createSignedUrl(
              (data as { lidar_point_cloud_ref: string }).lidar_point_cloud_ref,
              60 * 10,
            );
          if (signed?.signedUrl) setSignedUrl(signed.signedUrl);
        }
      }
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    (async () => {
      const { data, error } = await (
        supabase.from("in_lidar_scan") as unknown as {
          select: (cols: string) => {
            eq: (k: string, v: string) => {
              order: (
                c: string,
                o: { ascending: boolean },
              ) => Promise<{ data: LidarScanRow[] | null; error: { message: string } | null }>;
            };
          };
        }
      )
        .select(
          "id, room_label, storage_path_usdz, storage_path_json, size_bytes, room_summary, captured_at",
        )
        .eq("measurement_id", id)
        .order("captured_at", { ascending: false });
      if (error) toast.error(`Scans laden mislukt: ${error.message}`);
      setScans(data ?? []);
    })();
  }, [id, scanReload]);

  async function downloadScan(path: string) {
    const { data, error } = await supabase.storage
      .from("lidar-scans")
      .createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) {
      toast.error(`Download-link maken mislukt: ${error?.message ?? "geen URL"}`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function transition(next: "in_review" | "approved" | "rejected" | "submitted") {
    if (!row) return;
    setActing(next);
    const patch: Record<string, unknown> = { status: next };
    if (next === "approved" || next === "rejected" || next === "in_review") {
      patch.review_notes = notes || null;
    }
    const { error } = await (supabase.from("in_measurement") as unknown as {
      update: (p: Record<string, unknown>) => { eq: (k: string, v: string) => Promise<{ error: { message: string } | null }> };
    }).update(patch).eq("id", row.id);
    if (error) {
      toast.error(error.message);
    } else {
      await logAudit(`intake.status.${next}`, "in_measurement", row.id, {
        from: row.status,
        to: next,
      });
      toast.success(`Status gewijzigd naar ${next}`);
      navigate({ to: "/intake" });
    }
    setActing(null);
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Laden…</p>
      </AppShell>
    );
  }
  if (!row) {
    return (
      <AppShell>
        <p className="text-sm">Opname niet gevonden of geen toegang.</p>
        <Button asChild variant="link">
          <Link to="/intake">Terug</Link>
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link to="/intake">
            <ArrowLeft className="mr-1 h-4 w-4" /> Opnames
          </Link>
        </Button>

        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">
              Opname {row.object_ref ?? <span className="text-muted-foreground">zonder BAG-id</span>}
            </h1>
            <p className="text-xs text-muted-foreground">
              Opgenomen {new Date(row.captured_at).toLocaleString("nl-NL")}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline">{row.status}</Badge>
            <Badge variant="secondary">{row.source}</Badge>
            <Badge variant="secondary">bewijs: {row.evidence_level}</Badge>
          </div>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Object & locatie</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <Field label="BAG-id" value={row.object_ref ?? "—"} />
              <Field
                label="GPS"
                value={
                  row.captured_geo_lat != null && row.captured_geo_lng != null
                    ? `${row.captured_geo_lat}, ${row.captured_geo_lng}`
                    : "niet vastgelegd"
                }
              />
              <Field label="Snapshot-hash" value={row.snapshot_hash ?? "—"} mono />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bouwgegevens (payload)</CardTitle>
              <CardDescription>Onbewerkte invoer; in latere fase ISSO-conform.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">
                {JSON.stringify(row.payload, null, 2)}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>LiDAR / 3D-scans</CardTitle>
              <CardDescription>
                Apple RoomPlan-scans van de ruimtes binnen deze opname. Alleen toe te voegen zolang de opname op
                status “draft” staat.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {row.status === "draft" ? (
                <LidarScanButton
                  measurementId={row.id}
                  onUploaded={() => setScanReload((n) => n + 1)}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Opname is ingediend — nieuwe scans toevoegen kan niet meer.
                </p>
              )}

              {scans.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nog geen scans bij deze opname.</p>
              ) : (
                <ul className="grid gap-2">
                  {scans.map((s) => (
                    <li key={s.id} className="rounded-md border p-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{s.room_label ?? "ruimte"}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(s.captured_at).toLocaleString("nl-NL")}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {s.room_summary.wallCount ?? 0} muren ·{" "}
                        {s.room_summary.windowCount ?? 0} ramen ·{" "}
                        {s.room_summary.doorCount ?? 0} deuren ·{" "}
                        {(s.room_summary.floorAreaM2 ?? 0).toFixed(1)} m² vloer ·{" "}
                        plafond {(s.room_summary.ceilingHeightM ?? 0).toFixed(2)} m ·{" "}
                        {s.size_bytes ? `${(s.size_bytes / 1024 / 1024).toFixed(2)} MB` : "—"}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadScan(s.storage_path_usdz)}
                        >
                          <Download className="mr-1 h-4 w-4" /> USDZ
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadScan(s.storage_path_json)}
                        >
                          <Download className="mr-1 h-4 w-4" /> JSON
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {signedUrl && (
                <div className="mt-2 border-t pt-2">
                  <p className="mb-1 text-xs text-muted-foreground">
                    Legacy scan-bestand (uit eerder ingevoerd veld):
                  </p>
                  <Button asChild variant="outline" size="sm" className="w-fit">
                    <a href={signedUrl} target="_blank" rel="noreferrer">
                      <Download className="mr-1 h-4 w-4" /> Download legacy scan
                    </a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {row.reviewed_at && (
            <Card>
              <CardHeader>
                <CardTitle>Reviewer-historie</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                <Field label="Beoordeeld op" value={new Date(row.reviewed_at).toLocaleString("nl-NL")} />
                <Field label="Door" value={row.reviewed_by ?? "—"} mono />
                <Field label="Opmerking" value={row.review_notes ?? "—"} />
              </CardContent>
            </Card>
          )}

          {isReviewer && row.status !== "approved" && row.status !== "rejected" && (
            <Card>
              <CardHeader>
                <CardTitle>Beoordeling</CardTitle>
                <CardDescription>
                  Workflow: submitted → in_review → approved/rejected. Alleen reviewers zien dit blok; transities
                  worden in de database afgedwongen.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="review_notes">Opmerkingen reviewer</Label>
                  <Textarea
                    id="review_notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    maxLength={2000}
                  />
                </div>
                <Separator />
                <div className="flex flex-wrap gap-2">
                  {row.status === "submitted" && (
                    <Button
                      variant="outline"
                      onClick={() => transition("in_review")}
                      disabled={acting !== null}
                    >
                      {acting === "in_review" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      In review nemen
                    </Button>
                  )}
                  <Button
                    onClick={() => transition("approved")}
                    disabled={acting !== null || row.status === "draft"}
                  >
                    {acting === "approved" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Goedkeuren
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => transition("rejected")}
                    disabled={acting !== null || row.status === "draft"}
                  >
                    {acting === "rejected" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Afwijzen
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className={mono ? "break-all font-mono text-xs" : "break-words"}>{value}</span>
    </div>
  );
}
