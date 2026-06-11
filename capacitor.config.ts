import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor config for the native iPad wrapper.
// The webview loads the live Lovable preview build so every web change is
// instantly reflected in the iPad app — no rebuild needed for UI changes.
// After publishing, swap `server.url` to the published URL.
const config: CapacitorConfig = {
  appId: "nl.isolatieplan.tool",
  appName: "Isolatieplan Tool",
  webDir: "dist",
  server: {
    url: "https://id-preview--7ac6a831-68e3-442a-abfb-b208b55a243d.lovable.app",
    cleartext: true,
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
