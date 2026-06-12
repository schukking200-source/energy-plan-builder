import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { RoomPlanScanner } from "room-plan-scanner";
import type { ScanResult } from "room-plan-scanner";
import { Button } from "@/components/ui/button";
import { Loader2, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

interface Props {
  measurementId: string;
  /** Wordt aangeroepen na succesvolle upload zodat parent de lijst kan verversen */
  onUploaded?: () => void;
  /** Disable de knop als de opname al ingediend is */
  disabled?: boolean;
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}

export function LidarScanButton({ measurementId, onUploaded, disabled }: Props) {
  const [supported, setSupported] = useState<{ supported: boolean; reason?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!isNative) {
      setSupported({
        supported: false,
        reason: "Alleen beschikbaar in de native iOS-app op een iPhone Pro of iPad Pro met LiDAR",
      });
      return;
    }
    RoomPlanScanner.isSupported()
      .then(setSupported)
      .catch((e) => setSupported({ supported: false, reason: String(e) }));
  }, [isNative]);

  async function uploadScan(scan: ScanResult, roomLabel: string) {
    setBusy("uploading");
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("Niet ingelogd");
      const userId = userData.user.id;

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeLabel =
        roomLabel
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-")
          .replace(/^-+|-+$/g, "") || "room";
      const baseKey = `${userId}/${measurementId}/${stamp}-${safeLabel}`;
      const usdzKey = `${baseKey}.usdz`;
      const jsonKey = `${baseKey}.json`;

      const usdzBlob = base64ToBlob(scan.usdzBase64, "model/vnd.usdz+zip");
      const jsonBlob = new Blob([scan.jsonString], { type: "application/json" });

      const up1 = await supabase.storage
        .from("lidar-scans")
        .upload(usdzKey, usdzBlob, { contentType: "model/vnd.usdz+zip", upsert: false });
      if (up1.error) throw new Error(`USDZ upload: ${up1.error.message}`);

      const up2 = await supabase.storage
        .from("lidar-scans")
        .upload(jsonKey, jsonBlob, { contentType: "application/json", upsert: false });
      if (up2.error) throw new Error(`JSON upload: ${up2.error.message}`);

      const { error: insErr } = await (
        supabase.from("in_lidar_scan") as unknown as {
          insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
        }
      ).insert({
        measurement_id: measurementId,
        room_label: roomLabel,
        storage_path_usdz: usdzKey,
        storage_path_json: jsonKey,
        size_bytes: scan.sizeBytes,
        room_summary: scan.summary,
        device_meta: { ua: navigator.userAgent, native: true, scanner: "apple-roomplan-ios" },
      });
      if (insErr) throw new Error(`DB insert: ${insErr.message}`);

      await logAudit("lidar.scan.uploaded", "in_lidar_scan", measurementId, {
        room: roomLabel,
        wallCount: scan.summary.wallCount,
        floorAreaM2: scan.summary.floorAreaM2,
        sizeBytes: scan.sizeBytes,
      });

      toast.success(
        `Scan opgeslagen: ${scan.summary.wallCount} muren, ${scan.summary.floorAreaM2.toFixed(1)} m² vloer.`,
      );
      onUploaded?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Scan-upload mislukt: ${msg}`);
    } finally {
      setBusy(null);
    }
  }

  async function startScan() {
    const label = window.prompt(
      "Welke ruimte ga je scannen? (bv. woonkamer, slaapkamer 1)",
      "woonkamer",
    );
    if (!label) return;
    setBusy("scanning");
    try {
      const result = await RoomPlanScanner.startScan();
      await uploadScan(result, label.trim());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("annuleer") || msg.toLowerCase().includes("cancel")) {
        toast.info("Scan geannuleerd.");
      } else {
        toast.error(`Scan mislukt: ${msg}`);
      }
    } finally {
      if (busy !== "uploading") setBusy(null);
    }
  }

  if (supported === null) {
    return (
      <Button disabled variant="outline" size="sm">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> LiDAR controleren…
      </Button>
    );
  }

  if (!supported.supported) {
    return (
      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
          <ScanLine className="h-4 w-4" /> LiDAR-scan niet beschikbaar
        </div>
        {supported.reason ?? "Onbekende reden"}
      </div>
    );
  }

  return (
    <Button onClick={startScan} disabled={!!busy || disabled} className="w-fit">
      {busy === "scanning" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {busy === "uploading" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {!busy && <ScanLine className="mr-2 h-4 w-4" />}
      {busy === "scanning"
        ? "Scan loopt — beweeg je iPhone/iPad langzaam door de ruimte"
        : busy === "uploading"
          ? "Scan opslaan…"
          : "Ruimte scannen met iPhone/iPad LiDAR"}
    </Button>
  );
}
