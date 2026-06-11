import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor config for the native iPad wrapper.
// The iOS app loads the built files from `dist/`. This is more reliable in
// WKWebView than loading the transient preview URL directly.
const config: CapacitorConfig = {
  appId: "nl.isolatieplan.tool",
  appName: "Isolatieplan Tool",
  webDir: "dist",
  ios: {
    contentInset: "always",
  },
};

export default config;
