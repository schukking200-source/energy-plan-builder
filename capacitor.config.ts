import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor config for the native iOS wrapper.
// TanStack Start writes the browser bundle to `dist/client`; pointing Capacitor
// at plain `dist` copies the server bundle instead and can leave WKWebView white.
const config: CapacitorConfig = {
  appId: "nl.isolatieplan.tool",
  appName: "Isolatieplan Tool",
  webDir: "dist/client",
  includePlugins: ["room-plan-scanner", "@capacitor/haptics"],
  ios: {
    contentInset: "always",
  },
};

export default config;
