#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const clientDir = resolve(root, "dist/client");
const indexPath = resolve(clientDir, "index.html");
const serverEntryPath = resolve(root, "dist/server/server.js");

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`✓ ${message}`);
}

if (!existsSync(clientDir)) {
  fail("dist/client ontbreekt. Draai eerst: npm run build");
}

if (!existsSync(serverEntryPath)) {
  if (existsSync(indexPath)) {
    ok("dist/client/index.html bestaat al.");
    process.exit(0);
  }
  fail("dist/server/server.js ontbreekt. Draai eerst: npm run build");
}

try {
  const serverEntryUrl = `${pathToFileURL(serverEntryPath).href}?capacitor=${Date.now()}`;
  const module = await import(serverEntryUrl);
  const serverEntry = module.default ?? module;

  if (typeof serverEntry?.fetch !== "function") {
    fail("dist/server/server.js bevat geen geldige fetch-handler.");
  }

  const response = await serverEntry.fetch(new Request("http://localhost/"), {}, {});
  const html = await response.text();

  if (response.status >= 400) {
    fail(`Kon geen startpagina renderen voor Capacitor: HTTP ${response.status}\n${html.slice(0, 500)}`);
  }

  if (!html.includes("<html") || !html.includes("</html>") || !html.includes("/assets/")) {
    fail("De gerenderde startpagina lijkt geen complete app-HTML te zijn.");
  }

  mkdirSync(clientDir, { recursive: true });
  writeFileSync(indexPath, html, "utf8");
  ok("dist/client/index.html aangemaakt voor Capacitor.");
} catch (error) {
  fail(`Capacitor index.html maken mislukt: ${error instanceof Error ? error.message : String(error)}`);
}