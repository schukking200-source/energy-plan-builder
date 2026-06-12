#!/usr/bin/env bash
# Bouwt de web-app, synchroniseert Capacitor en start daarna de échte native
# iPad-app. Dit script opent geen Chrome/Safari en gebruikt geen Lovable preview-URL.

set -euo pipefail

log()  { printf "\n\033[1;34m==>\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
err()  { printf "\n\033[1;31m✗\033[0m %s\n" "$*" >&2; }

if [ ! -f "package.json" ]; then
  err "Start dit script vanuit de projectmap: cd isolatie-opname-app"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  err "npm ontbreekt. Installeer eerst Node.js of draai scripts/setup-ios.sh."
  exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
  err "Xcode ontbreekt. Installeer Xcode en open het één keer om de voorwaarden te accepteren."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  log "Dependencies installeren..."
  npm install
fi

log "Productie-build maken voor lokale WKWebView..."
npm run build

if [ ! -d "ios" ]; then
  log "iOS platform toevoegen..."
  npx cap add ios
fi

log "Capacitor synchroniseren met iOS..."
npx cap sync ios

log "Verbonden fysieke iPad zoeken..."
TARGET="${IOS_TARGET:-}"
if [ -z "${TARGET}" ]; then
  TARGET="$(xcrun xctrace list devices 2>/dev/null \
    | awk '/== Simulators ==/{exit} /\([0-9A-Fa-f-]{20,}\)/ && $0 !~ /Mac/ {print $0; exit}' \
    | sed -E 's/.*\(([0-9A-Fa-f-]{20,})\).*/\1/')"
fi

if [ -z "${TARGET}" ]; then
  err "Geen aangesloten fysieke iPad gevonden. Sluit de iPad via USB-C aan en kies 'Trust This Computer'."
  err "Gestopt: ik open geen Xcode, Chrome, Safari of preview. Sluit eerst de iPad aan en draai opnieuw: npm run ios:run"
  exit 1
fi

log "Native app installeren en starten op iPad (target: ${TARGET})..."
if ! npx cap run ios --target "${TARGET}"; then
  err "Native run is mislukt. Controleer Developer Mode, Trust Developer en Signing in Xcode."
  err "Gestopt: ik open geen Xcode, Chrome, Safari of preview. Los signing/Developer Mode op en draai opnieuw: npm run ios:run"
  exit 1
fi

ok "Native iPad-app gestart. Er is geen Chrome/Safari/webpreview geopend."