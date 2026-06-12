export interface RoomSummary {
  wallCount: number;
  doorCount: number;
  windowCount: number;
  openingCount: number;
  objectCount: number;
  floorAreaM2: number;
  ceilingHeightM: number;
}

export interface ScanResult {
  /** Absolute file:// pad naar het USDZ 3D-model in de app-sandbox */
  usdzPath: string;
  /** Absolute file:// pad naar het JSON model (CapturedRoom) */
  jsonPath: string;
  /** Bytes van het USDZ-bestand */
  sizeBytes: number;
  /** Base64-inhoud van het USDZ-bestand (klaar om naar Supabase Storage te uploaden) */
  usdzBase64: string;
  /** JSON tekst van CapturedRoom */
  jsonString: string;
  summary: RoomSummary;
}

export interface RoomPlanScannerPlugin {
  isSupported(): Promise<{ supported: boolean; reason?: string }>;
  startScan(): Promise<ScanResult>;
}
