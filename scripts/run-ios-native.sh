#!/usr/bin/env bash
# Native-only iPad runner.
# Belangrijk: dit script gebruikt GEEN `npx cap run ios`, GEEN live-reload,
# GEEN dev-server en GEEN browser/Chrome/Safari. Het bouwt met xcodebuild en
# installeert/start de .app rechtstreeks via Apple's `devicectl`.

set -euo pipefail

export BROWSER=none
export CAPACITOR_NO_OPEN=1
export npm_config_browser=none
export CI=1

log()  { printf "\n\033[1;34m==>\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
err()  { printf "\n\033[1;31m✗\033[0m %s\n" "$*" >&2; }

cap() {
  if [ -x "./node_modules/.bin/cap" ]; then
    ./node_modules/.bin/cap "$@"
  else
    npx --no-install cap "$@"
  fi
}

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

if ! xcrun devicectl --help >/dev/null 2>&1; then
  err "Apple devicectl ontbreekt. Installeer/update Xcode 15+ en draai daarna opnieuw: npm run ios:run"
  err "Gestopt: ik open geen Xcode, Chrome, Safari of preview."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  log "Dependencies installeren..."
  npm install
fi

log "RoomPlanScannerPlugin iOS-bronnen controleren..."
node scripts/ensure-roomplan-plugin.mjs

if [ "${IOS_SKIP_BUILD:-0}" != "1" ]; then
  log "Productie-build maken voor lokale WKWebView..."
  BROWSER=none npm_config_browser=none CI=1 npm run build
fi

log "Capacitor index.html controleren/maken..."
node scripts/create-capacitor-index.mjs

WEB_DIR="${IOS_WEB_DIR:-dist/client}"
if [ ! -f "${WEB_DIR}/index.html" ]; then
  err "Native web-build ontbreekt: ${WEB_DIR}/index.html"
  err "Dit project is TanStack Start; Capacitor moet 'dist/client' gebruiken, niet 'dist'."
  err "Gestopt vóór iPad-installatie om een wit scherm te voorkomen. Draai opnieuw: npm run ios:run"
  exit 1
fi

if [ ! -d "ios/App/App.xcodeproj" ] && [ ! -d "ios/App/App.xcworkspace" ]; then
  log "iOS Xcode-project ontbreekt — Capacitor iOS-platform (her)genereren..."
  rm -rf ios
  cap add ios
fi

if [ "${IOS_SKIP_SYNC:-0}" != "1" ]; then
  log "Capacitor synchroniseren met iOS..."
  cap sync ios
fi

if [ ! -d "ios/App/App.xcodeproj" ] && [ ! -d "ios/App/App.xcworkspace" ]; then
  err "ios/App/App.xcodeproj is na 'cap add ios' nog steeds afwezig. Draai: npm install && npx cap add ios"
  exit 1
fi

# RoomPlan vereist iOS 16+. cap sync kan dit terugzetten, dus elke run patchen.
PBXPROJ="ios/App/App.xcodeproj/project.pbxproj"
if [ -f "${PBXPROJ}" ]; then
  log "iOS deployment target verhogen naar 16.0..."
  /usr/bin/sed -i '' -E 's/IPHONEOS_DEPLOYMENT_TARGET = [0-9]+(\.[0-9]+)?;/IPHONEOS_DEPLOYMENT_TARGET = 16.0;/g' "${PBXPROJ}" || true
fi

# Apple Development Team ID onthouden zodat code signing automatisch werkt.
TEAM_FILE=".ios-dev-team"
if [ -z "${IOS_DEVELOPMENT_TEAM:-}" ] && [ -f "${TEAM_FILE}" ]; then
  IOS_DEVELOPMENT_TEAM="$(tr -d '[:space:]' < "${TEAM_FILE}")"
fi
if [ -z "${IOS_DEVELOPMENT_TEAM:-}" ]; then
  echo ""
  echo "Voor signing op je iPad heb je je Apple Development Team ID nodig (10 tekens)."
  echo "Vind hem in Xcode > Settings > Accounts > selecteer je Apple ID > kolom 'Team ID',"
  echo "of op https://developer.apple.com/account onder Membership Details."
  read -r -p "Team ID: " IOS_DEVELOPMENT_TEAM
  IOS_DEVELOPMENT_TEAM="$(printf "%s" "${IOS_DEVELOPMENT_TEAM}" | tr -d '[:space:]')"
  if [ -z "${IOS_DEVELOPMENT_TEAM}" ]; then
    err "Geen Team ID opgegeven. Gestopt."
    exit 1
  fi
  printf "%s\n" "${IOS_DEVELOPMENT_TEAM}" > "${TEAM_FILE}"
  ok "Team ID opgeslagen in ${TEAM_FILE} (wordt voortaan automatisch gebruikt)."
fi
export IOS_DEVELOPMENT_TEAM

log "Verbonden fysieke iPads detecteren..."
DEVICES_RAW="$(xcrun xctrace list devices 2>/dev/null \
  | awk '/== Simulators ==/{exit} /\([0-9A-Fa-f-]{20,}\)/ && $0 !~ /Mac/ && $0 !~ /Simulator/ {print}')"
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
if [ -n "${TARGET}" ]; then
  SELECTED="$(printf "%s\n" "${IPADS}" | grep -F "${TARGET}" || true)"
  if [ -z "${SELECTED}" ]; then
    err "IOS_TARGET=${TARGET} is niet gevonden tussen de aangesloten fysieke iPads."
    exit 1
  fi
elif [ "${IPAD_COUNT}" -gt 1 ]; then
  echo ""
  read -r -p "Welke iPad gebruiken? Voer regelnummer in: " CHOICE
  if ! printf "%s" "${CHOICE}" | grep -Eq '^[0-9]+$'; then
    err "Ongeldige keuze: ${CHOICE}"
    exit 1
  fi
  SELECTED="$(printf "%s\n" "${IPADS}" | sed -n "${CHOICE}p")"
  if [ -z "${SELECTED}" ]; then
    err "Geen iPad op regel ${CHOICE}."
    exit 1
  fi
  TARGET="$(printf "%s" "${SELECTED}" | sed -E 's/.*\(([0-9A-Fa-f-]{20,})\).*/\1/')"
else
  SELECTED="${IPADS}"
  TARGET="$(printf "%s" "${SELECTED}" | sed -E 's/.*\(([0-9A-Fa-f-]{20,})\).*/\1/')"
fi

DEVICE_NAME="$(printf "%s" "${SELECTED}" | sed -E 's/ \([0-9.]+\) \([0-9A-Fa-f-]{20,}\).*//' | sed -E 's/^[[:space:]]+//')"

if [ -z "${TARGET}" ] || [ "${TARGET}" = "${SELECTED}" ]; then
  err "Geen geldige iPad-UDID geselecteerd."
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

IOS_PROJECT_DIR="ios/App"
SCHEME="${IOS_SCHEME:-App}"
CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
DERIVED_DATA_PATH="${IOS_PROJECT_DIR}/DerivedData/${TARGET}"

if [ -d "${IOS_PROJECT_DIR}/App.xcworkspace" ]; then
  XCODE_CONTAINER_ARGS=(-workspace "App.xcworkspace")
elif [ -d "${IOS_PROJECT_DIR}/App.xcodeproj" ]; then
  XCODE_CONTAINER_ARGS=(-project "App.xcodeproj")
else
  err "Geen iOS Xcode-project gevonden in ${IOS_PROJECT_DIR}. Draai eerst: npm run ios:setup"
  exit 1
fi

PROVISIONING_ARGS=()
if [ "${IOS_ALLOW_PROVISIONING_UPDATES:-1}" = "1" ]; then
  PROVISIONING_ARGS=(-allowProvisioningUpdates)
fi

log "Native iOS-app bouwen met xcodebuild (geen cap run, geen browser)..."
( cd "${IOS_PROJECT_DIR}" && xcrun xcodebuild \
  "${XCODE_CONTAINER_ARGS[@]}" \
  -scheme "${SCHEME}" \
  -configuration "${CONFIGURATION}" \
  -destination "id=${TARGET}" \
  -derivedDataPath "DerivedData/${TARGET}" \
  "${PROVISIONING_ARGS[@]}" \
  build )

APP_PATH="$(find "${DERIVED_DATA_PATH}/Build/Products/${CONFIGURATION}-iphoneos" -maxdepth 1 -name "*.app" -type d | head -n 1)"
if [ -z "${APP_PATH}" ]; then
  err "Build klaar, maar geen .app gevonden in ${DERIVED_DATA_PATH}/Build/Products/${CONFIGURATION}-iphoneos"
  exit 1
fi

BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "${APP_PATH}/Info.plist" 2>/dev/null || true)"
if [ -z "${BUNDLE_ID}" ]; then
  err "Bundle ID niet gevonden in ${APP_PATH}/Info.plist"
  exit 1
fi

log "Native app installeren op iPad via devicectl..."
xcrun devicectl device install app --device "${TARGET}" "${APP_PATH}"

log "Native app starten op iPad via devicectl..."
xcrun devicectl device process launch --device "${TARGET}" "${BUNDLE_ID}"

ok "Native iPad-app gestart via devicectl. Chrome/Safari/Lovable-preview zijn niet gebruikt."