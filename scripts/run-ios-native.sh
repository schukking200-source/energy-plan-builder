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

log "Verbonden fysieke iPads detecteren..."
# Lijst van alle aangesloten fysieke devices (geen Mac, geen Simulator)
DEVICES_RAW="$(xcrun xctrace list devices 2>/dev/null \
  | awk '/== Simulators ==/{exit} /\([0-9A-Fa-f-]{20,}\)/ && $0 !~ /Mac/ {print}')"

# Filter alleen iPads
IPADS="$(printf "%s\n" "${DEVICES_RAW}" | grep -i "iPad" || true)"

if [ -z "${IPADS}" ]; then
  err "Geen aangesloten fysieke iPad gevonden. Sluit de iPad via USB-C aan en kies 'Trust This Computer'."
  err "Gestopt: ik open geen Xcode, Chrome, Safari of preview. Sluit eerst de iPad aan en draai opnieuw: npm run ios:run"
  exit 1
fi

IPAD_COUNT="$(printf "%s\n" "${IPADS}" | wc -l | tr -d ' ')"
log "Gevonden iPad(s):"
printf "%s\n" "${IPADS}" | nl -ba

TARGET="${IOS_TARGET:-}"
if [ -z "${TARGET}" ]; then
  if [ "${IPAD_COUNT}" -gt 1 ]; then
    echo ""
    read -r -p "Welke iPad gebruiken? Voer regelnummer in: " CHOICE
    SELECTED="$(printf "%s\n" "${IPADS}" | sed -n "${CHOICE}p")"
  else
    SELECTED="${IPADS}"
  fi
  TARGET="$(printf "%s" "${SELECTED}" | sed -E 's/.*\(([0-9A-Fa-f-]{20,})\).*/\1/')"
  DEVICE_NAME="$(printf "%s" "${SELECTED}" | sed -E 's/ \([0-9.]+\) \([0-9A-Fa-f-]{20,}\).*//' | sed -E 's/^[[:space:]]+//')"
else
  SELECTED="$(printf "%s\n" "${IPADS}" | grep "${TARGET}" || true)"
  DEVICE_NAME="$(printf "%s" "${SELECTED}" | sed -E 's/ \([0-9.]+\) \([0-9A-Fa-f-]{20,}\).*//' | sed -E 's/^[[:space:]]+//')"
  [ -z "${DEVICE_NAME}" ] && DEVICE_NAME="(opgegeven via IOS_TARGET)"
fi

if [ -z "${TARGET}" ]; then
  err "Geen geldige iPad geselecteerd."
  exit 1
fi

echo ""
log "Geselecteerde iPad:"
echo "    Naam : ${DEVICE_NAME}"
echo "    UDID : ${TARGET}"
echo ""
if [ "${IOS_CONFIRM:-1}" = "1" ]; then
  read -r -p "Is dit de juiste iPad? [y/N]: " CONFIRM
  case "${CONFIRM}" in
    y|Y|yes|YES|j|J|ja|JA) ok "Bevestigd." ;;
    *)
      err "Geannuleerd door gebruiker. Sluit de juiste iPad aan en draai opnieuw: npm run ios:run"
      err "Of forceer een target: IOS_TARGET=<udid> npm run ios:run"
      exit 1
      ;;
  esac
fi

log "Native app installeren en starten op iPad (target: ${TARGET})..."
if ! npx cap run ios --target "${TARGET}"; then
  err "Native run is mislukt. Controleer Developer Mode, Trust Developer en Signing in Xcode."
  err "Gestopt: ik open geen Xcode, Chrome, Safari of preview. Los signing/Developer Mode op en draai opnieuw: npm run ios:run"
  exit 1
fi

ok "Native iPad-app gestart. Er is geen Chrome/Safari/webpreview geopend."