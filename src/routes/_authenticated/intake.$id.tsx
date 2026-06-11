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

function IntakeDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { roles } = useMyRoles();
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [acting, setActing] = useState<string | null>(null);

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
              <CardTitle>LiDAR / 3D-scan</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <Field label="Scan-app" value={row.scan_app ?? "geen"} />
              <Field label="Formaat" value={row.scan_format ?? "—"} />
              <Field
                label="Grootte"
                value={row.scan_size_bytes ? `${(row.scan_size_bytes / 1024 / 1024).toFixed(2)} MB` : "—"}
              />
              {signedUrl ? (
                <Button asChild variant="outline" size="sm" className="mt-2 w-fit">
                  <a href={signedUrl} target="_blank" rel="noreferrer">
                    <Download className="mr-1 h-4 w-4" /> Download scan (10 min geldig)
                  </a>
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Geen scan-bestand bij deze opname.</p>
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
