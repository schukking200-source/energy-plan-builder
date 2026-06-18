import { registerPlugin } from "@capacitor/core";
import type { RoomPlanScannerPlugin } from "./definitions";

const RoomPlanScanner = registerPlugin<RoomPlanScannerPlugin>("RoomPlanScanner", {
  web: () => ({
    isSupported: async () => ({
      supported: false,
      reason: "Web/preview heeft geen Apple RoomPlan/LiDAR",
      platform: "web",
    }),
    startScan: async () => {
      throw new Error(
        "RoomPlan is alleen beschikbaar in de native iOS-app op een iPhone Pro of iPad Pro met LiDAR.",
      );
    },
  }),
});

export * from "./definitions";
export { RoomPlanScanner };
