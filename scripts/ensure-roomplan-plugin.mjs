#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const sourceRoot = resolve(root, "local-plugins/room-plan-scanner");
const installedRoot = resolve(root, "node_modules/room-plan-scanner");
const requiredFiles = [
  "ios/Sources/RoomPlanScannerPlugin/RoomPlanScannerPlugin.swift",
  "ios/Sources/RoomPlanScannerPlugin/RoomPlanScannerPlugin.m",
  "Package.swift",
  "package.json",
];

for (const file of requiredFiles) {
  if (!existsSync(resolve(sourceRoot, file))) {
    console.error(`RoomPlanScannerPlugin bronbestand ontbreekt: local-plugins/room-plan-scanner/${file}`);
    process.exit(1);
  }
}

mkdirSync(installedRoot, { recursive: true });

for (const entry of ["ios", "Package.swift", "RoomPlanScanner.podspec", "package.json", "src"]) {
  const from = resolve(sourceRoot, entry);
  const to = resolve(installedRoot, entry);
  if (!existsSync(from)) continue;
  rmSync(to, { recursive: true, force: true });
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

for (const file of requiredFiles) {
  if (!existsSync(resolve(installedRoot, file))) {
    console.error(`RoomPlanScannerPlugin is niet correct geïnstalleerd in node_modules: ${file}`);
    process.exit(1);
  }
}

console.log("✓ RoomPlanScannerPlugin iOS-bronnen staan in node_modules.");