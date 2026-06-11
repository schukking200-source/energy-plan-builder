// Centrale validatie voor LiDAR/3D-scan uploads (intake_measurement → lidar-scans bucket)
export const MAX_SCAN_BYTES = 500 * 1024 * 1024; // 500 MB
export const ALLOWED_SCAN_EXTENSIONS = [
  "usdz",
  "ply",
  "obj",
  "e57",
  "las",
  "fbx",
  "json",
  "zip",
] as const;

export type ScanValidationError = {
  code: "too_large" | "bad_extension" | "empty";
  message: string;
};

export function validateScanFile(file: File): ScanValidationError | null {
  if (!file || file.size === 0) {
    return { code: "empty", message: "Bestand is leeg." };
  }
  if (file.size > MAX_SCAN_BYTES) {
    return {
      code: "too_large",
      message: `Bestand is te groot (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_SCAN_BYTES / 1024 / 1024} MB.`,
    };
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_SCAN_EXTENSIONS.includes(ext as (typeof ALLOWED_SCAN_EXTENSIONS)[number])) {
    return {
      code: "bad_extension",
      message: `Bestandsformaat .${ext} niet toegestaan. Toegestaan: ${ALLOWED_SCAN_EXTENSIONS.join(", ")}.`,
    };
  }
  return null;
}
