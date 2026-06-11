import { registerPlugin } from "@capacitor/core";

export interface ScannedOpening {
  id: string;
  type: "raam" | "deur";
  width: string; // cm
  height: string; // cm
}

export interface ScannedRoom {
  id: string;
  name: string;
  type: string;
  floor: number;
  length: string; // meters
  width: string; // meters
  height: string; // meters
  windows: ScannedOpening[];
}

export interface RoomPlanResult {
  /** Base64-encoded USDZ */
  floorPlanData: string;
  mimeType: string;
  area?: number;
  roomCount?: number;
  rooms?: ScannedRoom[];
  totalWindows?: number;
  totalDoors?: number;
}

export interface RoomPlanPluginIface {
  isAvailable(): Promise<{ available: boolean }>;
  startScan(): Promise<RoomPlanResult>;
  capturePhoto(options?: { bouwdeel?: string }): Promise<{
    base64: string;
    mimeType: string;
    bouwdeel?: string;
    position?: { x: number; y: number; z: number };
  }>;
}

const RoomPlan = registerPlugin<RoomPlanPluginIface>("RoomPlan");
export default RoomPlan;
