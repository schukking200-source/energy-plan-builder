import { useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

interface Props {
  measurementId: string;
  onUploaded?: () => void;
  disabled?: boolean;
}

const ACCEPTED = ".glb,.gltf,.obj,.ply,.usdz";
const MAX_BYTES = 200 * 1024 * 1024; // 200 MB

type Format = "glb" | "gltf" | "obj" | "ply" | "usdz";

function detectFormat(name: string): Format | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "glb" || ext === "gltf" || ext === "obj" || ext === "ply" || ext === "usdz")
    return ext;
  return null;
}

type RoomSummary = {
  floorAreaM2?: number;
  ceilingHeightM?: number;
  volumeM3?: number;
  bbox?: { x: number; y: number; z: number };
  extractedFrom: Format;
  note?: string;
};

async function readBboxFromObject(obj: THREE.Object3D): Promise<RoomSummary["bbox"] | null> {
  const box = new THREE.Box3().setFromObject(obj);
  if (!isFinite(box.min.x) || !isFinite(box.max.x)) return null;
  const size = new THREE.Vector3();
  box.getSize(size);
  return { x: size.x, y: size.y, z: size.z };
}

async function extractMetrics(file: File, format: Format): Promise<RoomSummary> {
  if (format === "usdz") {
    return {
      extractedFrom: "usdz",
      note: "USDZ wordt in de browser niet automatisch uitgelezen — vul afmetingen handmatig in.",
    };
  }
  const buf = await file.arrayBuffer();
  let bbox: RoomSummary["bbox"] | null = null;

  try {
    if (format === "glb" || format === "gltf") {
      const loader = new GLTFLoader();
      const gltf = await loader.parseAsync(buf, "");
      bbox = await readBboxFromObject(gltf.scene);
    } else if (format === "obj") {
      const text = new TextDecoder().decode(buf);
      const loader = new OBJLoader();
      const group = loader.parse(text);
      bbox = await readBboxFromObject(group);
    } else if (format === "ply") {
      const loader = new PLYLoader();
      const geom = loader.parse(buf);
      const mesh = new THREE.Mesh(geom);
      bbox = await readBboxFromObject(mesh);
    }
  } catch (e) {
    return {
      extractedFrom: format,
      note: `Kon afmetingen niet uitlezen: ${String(e).slice(0, 120)}`,
    };
  }

  if (!bbox) {
    return { extractedFrom: format, note: "Geen geometrie gevonden in bestand." };
  }

  // Aanname: y is verticaal (standaard in Polycam/glTF). Vloer = x * z.
  const floorAreaM2 = bbox.x * bbox.z;
  const ceilingHeightM = bbox.y;
  const volumeM3 = bbox.x * bbox.y * bbox.z;

  return {
    extractedFrom: format,
    bbox,
    floorAreaM2,
    ceilingHeightM,
    volumeM3,
    note:
      "Berekend uit bounding-box van de scan (aanname: y-as = verticaal). Voor onregelmatige ruimtes is dit een bovengrens — controleer of pas handmatig aan.",
  };
}

export function LidarUploadButton({ measurementId, onUploaded, disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [roomLabel, setRoomLabel] = useState("");

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset zodat zelfde bestand opnieuw kan
    if (!file) return;

    const format = detectFormat(file.name);
    if (!format) {
      toast.error("Niet-ondersteund formaat. Gebruik .glb, .gltf, .obj, .ply of .usdz.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`Bestand te groot (${(file.size / 1024 / 1024).toFixed(0)} MB). Max 200 MB.`);
      return;
    }

    setBusy(true);
    try {
      toast.message("Afmetingen uitlezen…");
      const summary = await extractMetrics(file, format);

      toast.message("Uploaden naar opslag…");
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Niet ingelogd");

      const path = `${userId}/${measurementId}/${crypto.randomUUID()}.${format}`;
      const { error: upErr } = await supabase.storage
        .from("lidar-scans")
        .upload(path, file, {
          contentType:
            format === "glb"
              ? "model/gltf-binary"
              : format === "gltf"
                ? "model/gltf+json"
                : format === "usdz"
                  ? "model/vnd.usdz+zip"
                  : "application/octet-stream",
          upsert: false,
        });
      if (upErr) throw upErr;

      const insertRow = {
        measurement_id: measurementId,
        captured_by: userId,
        room_label: roomLabel || null,
        storage_path: path,
        storage_path_usdz: format === "usdz" ? path : null,
        storage_path_json: null,
        file_format: format,
        size_bytes: file.size,
        room_summary: summary as unknown as Record<string, unknown>,
        device_meta: { source: "upload", filename: file.name },
      };

      const { error: insErr } = await (
        supabase.from("in_lidar_scan") as unknown as {
          insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
        }
      ).insert(insertRow);
      if (insErr) throw insErr;

      await logAudit("lidar.upload", "in_lidar_scan", measurementId, {
        format,
        size_bytes: file.size,
        room_label: roomLabel || null,
      });

      toast.success("Scan geüpload");
      setRoomLabel("");
      onUploaded?.();
    } catch (err) {
      toast.error(`Upload mislukt: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="grid gap-1">
        <Label htmlFor="room_label" className="text-xs">
          Ruimte-label (optioneel)
        </Label>
        <Input
          id="room_label"
          placeholder="bv. woonkamer"
          value={roomLabel}
          onChange={(e) => setRoomLabel(e.target.value)}
          maxLength={80}
          disabled={busy || disabled}
        />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED}
        onChange={onPick}
        className="hidden"
      />
      <Button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy || disabled}
        className="w-fit"
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        LiDAR-bestand uploaden (Polycam / GLB / OBJ / PLY / USDZ)
      </Button>
      <p className="text-xs text-muted-foreground">
        Max 200 MB. Vloeroppervlak, plafondhoogte en volume worden automatisch berekend uit de
        bounding-box (USDZ uitgezonderd — daar voer je het zelf in).
      </p>
    </div>
  );
}
