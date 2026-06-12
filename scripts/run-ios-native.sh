#!/usr/bin/env bash
# Schone native iPad-runner voor RoomPlan/LiDAR.
# Eén pad, geen `cap run ios`, geen live-reload, geen browser, geen preview.

set -euo pipefail

export BROWSER=none
export CAPACITOR_NO_OPEN=1
export npm_config_browser=none
export CI=1

log()  { printf "\n\033[1;34m==>\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m!\033[0m %s\n" "$*"; }
err()  { printf "\n\033[1;31m✗\033[0m %s\n" "$*" >&2; }

usage() {
  cat <<'TXT'
Gebruik:
  npm run ios:run                 normale run
  npm run ios:clean               iOS-map + DerivedData schoon opnieuw genereren

Handige variabelen:
  IOS_DEVELOPMENT_TEAM=7FB5CA068F npm run ios:run
  IOS_TARGET=<iPad-UDID> IOS_CONFIRM=0 npm run ios:run
TXT
}

for arg in "$@"; do
  case "${arg}" in
    --clean) IOS_CLEAN=1 ;;
    --no-build) IOS_SKIP_BUILD=1 ;;
    --no-sync) IOS_SKIP_SYNC=1 ;;
    --yes|-y) IOS_CONFIRM=0 ;;
    --help|-h) usage; exit 0 ;;
    *) err "Onbekende optie: ${arg}"; usage; exit 1 ;;
  esac
done

cap() {
  if [ -x "./node_modules/.bin/cap" ]; then
    ./node_modules/.bin/cap "$@"
  else
    npx --no-install cap "$@"
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "$2"
    exit 1
  fi
}

patch_podfile_min_ios() {
  local podfile="ios/App/Podfile"
  [ -f "${podfile}" ] || return 0

  if grep -Eq "^platform :ios," "${podfile}"; then
    /usr/bin/perl -0pi -e "s/platform :ios, ['\"][0-9.]+['\"]/platform :ios, '16.0'/g" "${podfile}"
  else
    local tmp
    tmp="$(mktemp)"
    printf "platform :ios, '16.0'\n\n" > "${tmp}"
    cat "${podfile}" >> "${tmp}"
    mv "${tmp}" "${podfile}"
  fi
}

patch_package_swift_min_ios() {
  # Capacitor 8 genereert ook Swift Package manifests (o.a. CapApp-SPM).
  # Als daar nog iOS 15 in staat, faalt RoomPlanScanner ondanks gepatchte pbxproj's.
  while IFS= read -r -d '' package_file; do
    /usr/bin/perl -0pi -e 's/\.iOS\(\.v[0-9]+\)/.iOS(.v16)/g; s/\.iOS\("[0-9.]+"\)/.iOS("16.0")/g' "${package_file}"
  done < <(find ios -name 'Package.swift' -print0 2>/dev/null)
}

patch_info_plist() {
  local plist="ios/App/App/Info.plist"
  [ -f "${plist}" ] || return 0

  /usr/libexec/PlistBuddy -c "Set :NSCameraUsageDescription 'Camera-toegang is nodig om met de LiDAR-scanner ruimtes in 3D op te nemen voor het isolatieplan.'" "${plist}" \
    2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :NSCameraUsageDescription string 'Camera-toegang is nodig om met de LiDAR-scanner ruimtes in 3D op te nemen voor het isolatieplan.'" "${plist}" >/dev/null
}

patch_pbxproj() {
  local team="${1:-}"
  # Patch ALLE pbxproj-bestanden onder ios/ naar iOS 16.0 (App, CapApp-SPM, plugins).
  # Signing werkt op fysieke iPads alleen betrouwbaar als DEVELOPMENT_TEAM expliciet staat.
  while IFS= read -r -d '' pbxproj; do
    /usr/bin/perl -0pi -e 's/IPHONEOS_DEPLOYMENT_TARGET = [0-9]+(\.[0-9]+)?;/IPHONEOS_DEPLOYMENT_TARGET = 16.0;/g' "${pbxproj}"
    if [ -n "${team}" ]; then
      /usr/bin/perl -0pi -e "s/DEVELOPMENT_TEAM = (\"\"|[A-Z0-9]*);/DEVELOPMENT_TEAM = ${team};/g" "${pbxproj}"
    else
      /usr/bin/perl -0pi -e 's/DEVELOPMENT_TEAM = (""|[A-Z0-9]*);//g' "${pbxproj}"
    fi
  done < <(find ios -name 'project.pbxproj' -print0 2>/dev/null)
}



native_project_is_valid() {
  [ -d "ios/App/App.xcodeproj" ] && [ -f "ios/App/App/Info.plist" ] && [ -f "ios/App/Podfile" ]
}

ensure_ios_platform() {
  if [ "${IOS_CLEAN:-0}" = "1" ]; then
    log "Schone iOS-reset: gegenereerde ios-map verwijderen..."
    rm -rf ios
  elif [ -d "ios" ] && ! native_project_is_valid; then
    warn "iOS-map is half of inconsistent; ik genereer hem opnieuw in plaats van doorrommelen."
    rm -rf ios
  fi

  if ! native_project_is_valid; then
    log "Capacitor iOS-platform genereren..."
    if ! cap add ios; then
      warn "Eerste generatie faalde; ik zet iOS 16.0 in de Podfile en synchroniseer opnieuw."
      patch_podfile_min_ios
      cap sync ios
    fi
  fi

  patch_podfile_min_ios

  if [ "${IOS_SKIP_SYNC:-0}" != "1" ]; then
    log "Capacitor synchroniseren met iOS..."
    if ! cap sync ios; then
      warn "Sync faalde; ik herstel de iOS-minimumversie en probeer één keer opnieuw."
      patch_podfile_min_ios
      cap sync ios
    fi
  fi

  patch_podfile_min_ios
  patch_package_swift_min_ios
  patch_info_plist
  patch_pbxproj ""
}

normalize_team() {
  printf "%s" "$1" | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]'
}

is_valid_team_id() {
  printf "%s" "$1" | grep -Eq '^[A-Z0-9]{10}$' && [ "$1" != "ABCDE12345" ]
}

detect_team_from_xcode_project() {
  local pbxproj="ios/App/App.xcodeproj/project.pbxproj"
  [ -f "${pbxproj}" ] || return 0
  grep -Eo 'DEVELOPMENT_TEAM = [A-Z0-9]{10};' "${pbxproj}" \
    | head -n 1 \
    | sed -E 's/DEVELOPMENT_TEAM = ([A-Z0-9]{10});/\1/'
}

detect_team_from_xcode_build_settings() {
  [ -d "ios/App/App.xcodeproj" ] || return 0
  ( cd ios/App && xcrun xcodebuild -project App.xcodeproj -scheme App -showBuildSettings 2>/dev/null \
    | awk '/DEVELOPMENT_TEAM = [A-Z0-9]{10}/ {print $3; exit}' )
}

detect_team_from_keychain() {
  security find-identity -v -p codesigning 2>/dev/null \
    | grep -Eo '\(([A-Z0-9]{10})\)' \
    | head -n 1 \
    | tr -d '()'
}

detect_team_from_profiles() {
  local dir="$HOME/Library/MobileDevice/Provisioning Profiles"
  [ -d "${dir}" ] || return 0

  local profile team
  for profile in "${dir}"/*.mobileprovision "${dir}"/*.provisionprofile; do
    [ -f "${profile}" ] || continue
    team="$(security cms -D -i "${profile}" 2>/dev/null \
      | /usr/libexec/PlistBuddy -c 'Print :TeamIdentifier:0' /dev/stdin 2>/dev/null || true)"
    if printf "%s" "${team}" | grep -Eq '^[A-Z0-9]{10}$'; then
      printf "%s" "${team}"
      return 0
    fi
  done
}

resolve_team_id() {
  local team_file=".ios-dev-team"
  local team=""
  local default_team
  default_team="$(normalize_team "${IOS_DEFAULT_DEVELOPMENT_TEAM:-7FB5CA068F}")"

  if [ -n "${IOS_DEVELOPMENT_TEAM:-}" ]; then
    team="$(normalize_team "${IOS_DEVELOPMENT_TEAM}")"
    ok "Team ID geladen uit IOS_DEVELOPMENT_TEAM: ${team}"
  elif [ -n "${DEVELOPMENT_TEAM:-}" ]; then
    team="$(normalize_team "${DEVELOPMENT_TEAM}")"
    ok "Team ID geladen uit DEVELOPMENT_TEAM: ${team}"
  elif [ -n "${APPLE_TEAM_ID:-}" ]; then
    team="$(normalize_team "${APPLE_TEAM_ID}")"
    ok "Team ID geladen uit APPLE_TEAM_ID: ${team}"
  elif is_valid_team_id "${default_team}"; then
    team="${default_team}"
    ok "Team ID ingesteld op projectstandaard: ${team}"
  elif [ -f "${team_file}" ]; then
    team="$(normalize_team "$(cat "${team_file}" 2>/dev/null || true)")"
    [ -n "${team}" ] && ok "Team ID geladen uit ${team_file}: ${team}"
  elif team="$(normalize_team "$(detect_team_from_xcode_project)")" && is_valid_team_id "${team}"; then
    ok "Team ID gevonden in Xcode-project: ${team}"
  elif team="$(normalize_team "$(detect_team_from_xcode_build_settings)")" && is_valid_team_id "${team}"; then
    ok "Team ID gevonden in Xcode build settings: ${team}"
  elif team="$(normalize_team "$(detect_team_from_keychain)")" && is_valid_team_id "${team}"; then
    ok "Team ID gevonden in Keychain: ${team}"
  elif team="$(normalize_team "$(detect_team_from_profiles)")" && is_valid_team_id "${team}"; then
    ok "Team ID gevonden in provisioning profile: ${team}"
  fi

  if ! is_valid_team_id "${team}"; then
    rm -f "${team_file}"
    patch_pbxproj ""
    patch_package_swift_min_ios
    err "Geen Apple Development Team ID gevonden. Fysieke iPad-builds hebben die verplicht nodig."
    err "Draai éénmalig: IOS_DEVELOPMENT_TEAM=7FB5CA068F npm run ios:run"
    err "Of zet je eigen Team ID in plaats van 7FB5CA068F als Xcode een andere toont."
    exit 1
  fi

  if [ ! -f "${team_file}" ] || [ "$(normalize_team "$(cat "${team_file}" 2>/dev/null || true)")" != "${team}" ]; then
    printf "%s\n" "${team}" > "${team_file}"
    ok "Team ID gecached in ${team_file}."
  fi

  IOS_DEVELOPMENT_TEAM="${team}"
  export IOS_DEVELOPMENT_TEAM
  patch_pbxproj "${IOS_DEVELOPMENT_TEAM}"
}


select_ipad() {
  log "Verbonden fysieke iPads detecteren..."
  local devices_raw ipads ipad_count selected target version major
  devices_raw="$(xcrun xctrace list devices 2>/dev/null \
    | awk '/== Simulators ==/{exit} /\([0-9A-Fa-f-]{20,}\)/ && $0 !~ /Mac/ && $0 !~ /Simulator/ {print}')"
  ipads="$(printf "%s\n" "${devices_raw}" | grep -i "iPad" || true)"

  if [ -z "${ipads}" ]; then
    err "Geen aangesloten fysieke iPad gevonden. Sluit de iPad via USB-C aan en kies 'Trust This Computer'."
    err "Dit script opent geen Xcode, Chrome, Safari of preview."
    exit 1
  fi

  ipad_count="$(printf "%s\n" "${ipads}" | wc -l | tr -d ' ')"
  log "Gevonden iPad(s):"
  printf "%s\n" "${ipads}" | nl -ba

  target="${IOS_TARGET:-}"
  if [ -n "${target}" ]; then
    selected="$(printf "%s\n" "${ipads}" | grep -F "${target}" || true)"
    if [ -z "${selected}" ]; then
      err "IOS_TARGET=${target} is niet gevonden tussen de aangesloten fysieke iPads."
      exit 1
    fi
  elif [ "${ipad_count}" -gt 1 ]; then
    echo ""
    read -r -p "Welke iPad gebruiken? Voer regelnummer in: " CHOICE
    if ! printf "%s" "${CHOICE}" | grep -Eq '^[0-9]+$'; then
      err "Ongeldige keuze: ${CHOICE}"
      exit 1
    fi
    selected="$(printf "%s\n" "${ipads}" | sed -n "${CHOICE}p")"
    if [ -z "${selected}" ]; then
      err "Geen iPad op regel ${CHOICE}."
      exit 1
    fi
    target="$(printf "%s" "${selected}" | sed -E 's/.*\(([0-9A-Fa-f-]{20,})\).*/\1/')"
  else
    selected="${ipads}"
    target="$(printf "%s" "${selected}" | sed -E 's/.*\(([0-9A-Fa-f-]{20,})\).*/\1/')"
  fi

  DEVICE_NAME="$(printf "%s" "${selected}" | sed -E 's/ \([0-9.]+\) \([0-9A-Fa-f-]{20,}\).*//' | sed -E 's/^[[:space:]]+//')"
  TARGET="${target}"

  if [ -z "${TARGET}" ] || [ "${TARGET}" = "${selected}" ]; then
    err "Geen geldige iPad-UDID geselecteerd."
    exit 1
  fi

  version="$(printf "%s" "${selected}" | sed -nE 's/.* \(([0-9]+(\.[0-9]+){0,2})\) \([0-9A-Fa-f-]{20,}\).*/\1/p')"
  major="${version%%.*}"
  if [ -n "${major}" ] && printf "%s" "${major}" | grep -Eq '^[0-9]+$' && [ "${major}" -lt 16 ]; then
    err "RoomPlan vereist iPadOS 16 of hoger; geselecteerde iPad draait ${version}."
    exit 1
  fi

  echo ""
  log "Geselecteerde iPad:"
  echo "    Naam   : ${DEVICE_NAME}"
  echo "    iPadOS : ${version:-onbekend}"
  echo "    UDID   : ${TARGET}"

  if [ "${IOS_CONFIRM:-1}" = "1" ]; then
    echo ""
    read -r -p "Is dit de juiste iPad? [y/N]: " CONFIRM
    case "${CONFIRM}" in
      y|Y|yes|YES|j|J|ja|JA) ok "Bevestigd." ;;
      *)
        err "Geannuleerd. Forceer eventueel een target: IOS_TARGET=<udid> npm run ios:run"
        exit 1
        ;;
    esac
  fi
}

if [ ! -f "package.json" ]; then
  err "Start dit script vanuit de projectmap."
  exit 1
fi

require_command npm "npm ontbreekt. Installeer Node.js of draai scripts/setup-ios.sh."
require_command xcrun "Xcode ontbreekt. Installeer Xcode en open het één keer om de voorwaarden te accepteren."

if ! xcrun devicectl --help >/dev/null 2>&1; then
  err "Apple devicectl ontbreekt. Installeer/update Xcode 15+ en draai daarna opnieuw: npm run ios:run"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  log "Dependencies installeren..."
  npm install
fi

log "RoomPlanScannerPlugin controleren..."
node scripts/ensure-roomplan-plugin.mjs

if [ "${IOS_SKIP_BUILD:-0}" != "1" ]; then
  log "Web-build maken voor lokale WKWebView..."
  BROWSER=none npm_config_browser=none CI=1 npm run build
fi

log "Capacitor index.html maken/controleren..."
node scripts/create-capacitor-index.mjs

WEB_DIR="${IOS_WEB_DIR:-dist/client}"
if [ ! -f "${WEB_DIR}/index.html" ]; then
  err "Native web-build ontbreekt: ${WEB_DIR}/index.html"
  err "Capacitor moet voor TanStack Start 'dist/client' gebruiken."
  exit 1
fi

ensure_ios_platform
resolve_team_id
select_ipad

IOS_PROJECT_DIR="ios/App"
SCHEME="${IOS_SCHEME:-App}"
CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
DERIVED_DATA_PATH="${IOS_PROJECT_DIR}/DerivedData/${TARGET}"

if [ -d "${IOS_PROJECT_DIR}/App.xcworkspace" ]; then
  XCODE_CONTAINER_ARGS=(-workspace "App.xcworkspace")
elif [ -d "${IOS_PROJECT_DIR}/App.xcodeproj" ]; then
  XCODE_CONTAINER_ARGS=(-project "App.xcodeproj")
else
  err "Geen iOS Xcode-project gevonden in ${IOS_PROJECT_DIR}. Draai: npm run ios:clean"
  exit 1
fi

PROVISIONING_ARGS=()
if [ "${IOS_ALLOW_PROVISIONING_UPDATES:-1}" = "1" ]; then
  PROVISIONING_ARGS=(-allowProvisioningUpdates)
fi

log "Oude DerivedData voor deze iPad verwijderen..."
rm -rf "${DERIVED_DATA_PATH}"

log "Native iOS-app bouwen met xcodebuild..."
XCODE_TEAM_ARGS=()
if [ -n "${IOS_DEVELOPMENT_TEAM:-}" ]; then
  XCODE_TEAM_ARGS=(DEVELOPMENT_TEAM="${IOS_DEVELOPMENT_TEAM}")
fi
( cd "${IOS_PROJECT_DIR}" && xcrun xcodebuild \
  "${XCODE_CONTAINER_ARGS[@]}" \
  -scheme "${SCHEME}" \
  -configuration "${CONFIGURATION}" \
  -destination "id=${TARGET}" \
  -derivedDataPath "DerivedData/${TARGET}" \
  ${PROVISIONING_ARGS[@]+"${PROVISIONING_ARGS[@]}"} \
  ${XCODE_TEAM_ARGS[@]+"${XCODE_TEAM_ARGS[@]}"} \
  CODE_SIGN_STYLE=Automatic \
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

log "Native app installeren op iPad..."
xcrun devicectl device install app --device "${TARGET}" "${APP_PATH}"

log "Native app starten op iPad..."
xcrun devicectl device process launch --device "${TARGET}" "${BUNDLE_ID}"

ok "Native iPad-app gestart. LiDAR-scan loopt via de RoomPlanScanner-plugin; geen browser/preview gebruikt."