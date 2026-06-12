import { registerPlugin } from "@capacitor/core";
import type { RoomPlanScannerPlugin } from "./definitions";

const RoomPlanScanner = registerPlugin<RoomPlanScannerPlugin>("RoomPlanScanner", {
  web: () => ({
    isSupported: async () => ({ supported: false, reason: "Web/preview heeft geen LiDAR" }),
    startScan: async () => {
      throw new Error("RoomPlan is alleen beschikbaar op een iPad Pro met LiDAR (native app).");
    },
  }),
});

export * from "./definitions";
export { RoomPlanScanner };
