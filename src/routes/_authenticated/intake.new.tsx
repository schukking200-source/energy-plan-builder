import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { Loader2, MapPin, Upload, Smartphone } from "lucide-react";
import { ALLOWED_SCAN_EXTENSIONS, MAX_SCAN_BYTES, validateScanFile } from "@/lib/upload-validation";
import { Capacitor } from "@capacitor/core";
import { RoomPlanScanner } from "room-plan-scanner";

type RoomPlanResult = {
  area: number;
  roomCount: number;
  totalWindows: number;
  totalDoors: number;
  rooms: never[];
};

export const Route = createFileRoute("/_authenticated/intake/new")({
  head: () => ({ meta: [{ title: "Nieuwe opname — Isolatieplan Tool" }] }),
  component: NewIntake,
});

const schema = z.object({
  object_ref: z.string().trim().max(64).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  source: z.enum(["manual", "measured", "inferred", "lidar_derived"]),
  evidence_level: z.enum(["low", "medium", "high"]),
  scan_app: z
    .enum([
      "polycam",
      "scaniverse",
      "scanner3d_app",
      "canvas",
      "roomplan_native",
      "manual",
      "other",
    ])
    .optional(),
  scan_format: z.string().trim().max(16).optional().or(z.literal("")),
  // ISSO-light velden
  bouwjaar: z.coerce
    .number()
    .int()
    .min(1800)
    .max(2100)
    .optional()
    .or(z.literal("" as unknown as number)),
  gebruiksoppervlak_m2: z.coerce
    .number()
    .min(0)
    .max(10000)
    .optional()
    .or(z.literal("" as unknown as number)),
  dakisolatie_rc: z.coerce
    .number()
    .min(0)
    .max(20)
    .optional()
    .or(z.literal("" as unknown as number)),
  gevelisolatie_rc: z.coerce
    .number()
    .min(0)
    .max(20)
    .optional()
    .or(z.literal("" as unknown as number)),
  vloerisolatie_rc: z.coerce
    .number()
    .min(0)
    .max(20)
    .optional()
    .or(z.literal("" as unknown as number)),
  glas_type: z.string().trim().max(32).optional().or(z.literal("")),
});

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function NewIntake() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [lidarResult, setLidarResult] = useState<RoomPlanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  function captureGeo() {
    if (!navigator.geolocation) {
      toast.error("Geolocatie niet beschikbaar in deze browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success("Locatie vastgelegd");
      },
      () => toast.error("Locatie kon niet worden opgehaald"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function startLidarScan() {
    if (!isNative) {
      toast.error(
        "LiDAR werkt alleen in de native iOS-app op een iPhone Pro of iPad Pro met LiDAR.",
      );
      return;
    }
    setScanning(true);
    try {
      const sup = await RoomPlanScanner.isSupported();
      if (!sup.supported) {
        toast.error(sup.reason ?? "Dit apparaat ondersteunt LiDAR/RoomPlan niet.");
        return;
      }
      const result = await RoomPlanScanner.startScan();
      const mapped: RoomPlanResult = {
        area: result.summary.floorAreaM2,
        roomCount: 1,
        totalWindows: result.summary.windowCount,
        totalDoors: result.summary.doorCount,
        rooms: [],
      };
      setLidarResult(mapped);
      // Converteer base64 USDZ → File zodat bestaande upload-flow werkt
      const bin = atob(result.usdzBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const file = new File([bytes], "roomplan.usdz", { type: "model/vnd.usdz+zip" });
      setScanFile(file);
      toast.success(
        `Scan voltooid! ${mapped.area.toFixed(1)} m², ${result.summary.wallCount} muren, ${mapped.totalWindows} ramen`,
      );
    } catch (e) {
      const msg = (e as Error).message ?? "LiDAR-scan mislukt";
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("annuleer")) {
        toast.info("Scan geannuleerd.");
      } else {
        toast.error(msg);
      }
    } finally {
      setScanning(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>, finalize: boolean) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const form = new FormData(e.currentTarget);
      const raw = Object.fromEntries(form.entries());
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Ongeldige invoer");
        setSubmitting(false);
        return;
      }
      const v = parsed.data;

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        toast.error("Niet ingelogd");
        setSubmitting(false);
        return;
      }

      const payload = {
        notes: v.notes || null,
        bouwjaar: v.bouwjaar || null,
        gebruiksoppervlak_m2: v.gebruiksoppervlak_m2 || null,
        rc_waarden: {
          dak: v.dakisolatie_rc || null,
          gevel: v.gevelisolatie_rc || null,
          vloer: v.vloerisolatie_rc || null,
        },
        glas_type: v.glas_type || null,
      };

      const device_meta = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        captured_via: isNative ? "native-ios" : "web-pwa",
      };

      const snapshot_hash = await sha256(
        JSON.stringify({ payload, geo, device_meta, captured_at: new Date().toISOString() }),
      );

      const insertRow = {
        object_ref: v.object_ref || null,
        captured_by: user.id,
        captured_geo_lat: geo?.lat ?? null,
        captured_geo_lng: geo?.lng ?? null,
        device_meta,
        payload,
        source: v.source,
        evidence_level: v.evidence_level,
        scan_app: v.scan_app ?? null,
        scan_format: v.scan_format || null,
        snapshot_hash,
        status: finalize ? ("submitted" as const) : ("draft" as const),
      };

      const { data: row, error: insertErr } = await supabase
        .from("in_measurement")
        .insert(insertRow)
        .select("id")
        .single();

      if (insertErr || !row) {
        toast.error(insertErr?.message ?? "Opslaan mislukt");
        setSubmitting(false);
        return;
      }

      // LiDAR-scan upload (optioneel) — pad: {user_id}/{measurement_id}/{filename}
      if (scanFile) {
        const guard = validateScanFile(scanFile);
        if (guard) {
          toast.error(guard.message);
          setSubmitting(false);
          return;
        }
        const ext = scanFile.name.split(".").pop()?.toLowerCase() ?? "bin";
        const path = `${user.id}/${row.id}/scan.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("lidar-scans")
          .upload(path, scanFile, { upsert: false, contentType: scanFile.type || undefined });

        if (upErr) {
          toast.error(`Scan upload mislukt: ${upErr.message}`);
        } else {
          await supabase
            .from("in_measurement")
            .update({
              lidar_point_cloud_ref: path,
              scan_size_bytes: scanFile.size,
              roomplan_json: lidarResult
                ? (JSON.parse(
                    JSON.stringify({
                      source: "roomplan_native",
                      area: lidarResult.area ?? null,
                      roomCount: lidarResult.roomCount ?? null,
                      totalWindows: lidarResult.totalWindows ?? null,
                      totalDoors: lidarResult.totalDoors ?? null,
                      rooms: lidarResult.rooms ?? [],
                      captured_at: new Date().toISOString(),
                    }),
                  ) as never)
                : null,
            })
            .eq("id", row.id);
        }
      }

      await logAudit(
        finalize ? "intake.submitted" : "intake.draft_created",
        "in_measurement",
        row.id,
        { object_ref: v.object_ref || null, has_scan: !!scanFile, source: v.source },
      );

      toast.success(finalize ? "Opname ingediend" : "Concept opgeslagen");
      navigate({ to: "/intake" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Onbekende fout";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-xl font-semibold">Nieuwe opname</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Web-PWA formulier. Bestanden uit Polycam / Scaniverse / 3d Scanner App kunnen onderaan
          worden geüpload als LiDAR-bewijs.
        </p>

        <form onSubmit={(e) => onSubmit(e, false)}>
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Object & locatie</CardTitle>
                <CardDescription>BAG-id is optioneel zolang Fase 2 niet live is.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="object_ref">BAG-id / objectreferentie</Label>
                  <Input
                    id="object_ref"
                    name="object_ref"
                    placeholder="bv. 0344010000123456"
                    maxLength={64}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>GPS-locatie</Label>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={captureGeo}>
                      <MapPin className="mr-1 h-4 w-4" /> Vastleggen
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {geo ? `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}` : "niet vastgelegd"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Bouwgegevens (ISSO-light)</CardTitle>
                <CardDescription>
                  Velden worden in Fase 3-detail uitgebreid naar volledig ISSO-protocol.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="bouwjaar">Bouwjaar</Label>
                  <Input id="bouwjaar" name="bouwjaar" type="number" min={1800} max={2100} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="gebruiksoppervlak_m2">Gebruiksoppervlak (m²)</Label>
                  <Input
                    id="gebruiksoppervlak_m2"
                    name="gebruiksoppervlak_m2"
                    type="number"
                    step="0.1"
                    min={0}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="dakisolatie_rc">Rc dak (m²·K/W)</Label>
                  <Input
                    id="dakisolatie_rc"
                    name="dakisolatie_rc"
                    type="number"
                    step="0.1"
                    min={0}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="gevelisolatie_rc">Rc gevel (m²·K/W)</Label>
                  <Input
                    id="gevelisolatie_rc"
                    name="gevelisolatie_rc"
                    type="number"
                    step="0.1"
                    min={0}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="vloerisolatie_rc">Rc vloer (m²·K/W)</Label>
                  <Input
                    id="vloerisolatie_rc"
                    name="vloerisolatie_rc"
                    type="number"
                    step="0.1"
                    min={0}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="glas_type">Glas-type</Label>
                  <Input
                    id="glas_type"
                    name="glas_type"
                    placeholder="HR++, triple, enkel…"
                    maxLength={32}
                  />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="notes">Opmerkingen</Label>
                  <Textarea id="notes" name="notes" rows={3} maxLength={2000} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Bronstatus & bewijskracht</CardTitle>
                <CardDescription>
                  Wordt per opname vastgelegd zodat reviewer en steekproef weten hoe hard de data
                  is.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Bron</Label>
                  <Select name="source" defaultValue="manual">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Handmatig ingevoerd</SelectItem>
                      <SelectItem value="measured">Gemeten ter plaatse</SelectItem>
                      <SelectItem value="inferred">Afgeleid (bv. bouwjaar)</SelectItem>
                      <SelectItem value="lidar_derived">Uit LiDAR-scan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Bewijskracht</Label>
                  <Select name="evidence_level" defaultValue="low">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Laag</SelectItem>
                      <SelectItem value="medium">Middel</SelectItem>
                      <SelectItem value="high">Hoog</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>LiDAR / 3D-scan (optioneel)</CardTitle>
                <CardDescription>
                  iOS-app (Polycam, Scaniverse, 3d Scanner App, Canvas, RoomPlan) → exporteer naar
                  .usdz/.ply/.obj/.e57 → upload hier. Bestand wordt opgeslagen onder{" "}
                  <code>lidar-scans/{`{user_id}/{intake_id}`}</code> en is alleen zichtbaar voor jou
                  + reviewers.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Scan-app</Label>
                  <Select name="scan_app" defaultValue="manual">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Geen scan</SelectItem>
                      <SelectItem value="polycam">Polycam</SelectItem>
                      <SelectItem value="scaniverse">Scaniverse</SelectItem>
                      <SelectItem value="scanner3d_app">3d Scanner App</SelectItem>
                      <SelectItem value="canvas">Canvas (Occipital)</SelectItem>
                      <SelectItem value="roomplan_native">RoomPlan native</SelectItem>
                      <SelectItem value="other">Anders</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="scan_format">Bestandsformaat</Label>
                  <Input
                    id="scan_format"
                    name="scan_format"
                    placeholder="usdz, ply, obj, e57…"
                    maxLength={16}
                  />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label>Native iPhone/iPad LiDAR-scan</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      onClick={startLidarScan}
                      disabled={!isNative || scanning}
                      variant={isNative ? "default" : "outline"}
                    >
                      {scanning ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Smartphone className="mr-2 h-4 w-4" />
                      )}
                      {isNative ? "Start RoomPlan-scan" : "Alleen in iOS-app"}
                    </Button>
                    {lidarResult && (
                      <span className="text-xs text-muted-foreground">
                        ✓ {lidarResult.area?.toFixed(1)} m² · {lidarResult.roomCount} ruimte(s) ·{" "}
                        {lidarResult.totalWindows} ramen
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Werkt op iPhone Pro en iPad Pro met LiDAR via de native Capacitor-wrapper.
                    Resultaat wordt opgeslagen als USDZ + gestructureerde JSON (ruimtes, ramen,
                    deuren).
                  </p>
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="scan_file">Scan-bestand</Label>
                  <Input
                    id="scan_file"
                    type="file"
                    accept={ALLOWED_SCAN_EXTENSIONS.map((e) => "." + e).join(",")}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (!f) {
                        setScanFile(null);
                        return;
                      }
                      const err = validateScanFile(f);
                      if (err) {
                        toast.error(err.message);
                        e.target.value = "";
                        setScanFile(null);
                        return;
                      }
                      setScanFile(f);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Toegestaan: {ALLOWED_SCAN_EXTENSIONS.join(", ")} — max{" "}
                    {MAX_SCAN_BYTES / 1024 / 1024} MB.
                  </p>
                  {scanFile && (
                    <p className="text-xs text-muted-foreground">
                      <Upload className="mr-1 inline h-3 w-3" />
                      {scanFile.name} — {(scanFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="outline" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Concept opslaan
              </Button>
              <Button
                type="button"
                onClick={(e) => {
                  const formEl = (e.currentTarget as HTMLButtonElement).closest("form");
                  if (formEl) {
                    onSubmit(
                      {
                        preventDefault: () => {},
                        currentTarget: formEl,
                      } as unknown as React.FormEvent<HTMLFormElement>,
                      true,
                    );
                  }
                }}
                disabled={submitting}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Indienen
              </Button>
            </div>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
