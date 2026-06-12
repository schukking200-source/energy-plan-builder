#!/usr/bin/env bash
# All-in-one setup: installeert Homebrew/Node indien nodig, kloont de repo,
# draait npm install + build en start de échte native iPad-app via devicectl.
# Dit opent bewust géén Chrome/Safari/webpreview en gebruikt geen `cap run`.
#
# Snelle start (kopieer/plak één regel in Terminal):
#   cd ~/Documents && curl -fsSL https://raw.githubusercontent.com/schukking200-source/isolatie-opname-app/main/scripts/setup-ios.sh | bash
#
# Met privé-repo token:
#   GITHUB_TOKEN=ghp_xxx bash setup-ios.sh

set -euo pipefail

export BROWSER=none
export CAPACITOR_NO_OPEN=1
export npm_config_browser=none
export CI=1

REPO_USER="schukking200-source"
REPO_NAME="isolatie-opname-app"
REPO_DIR="${REPO_NAME}"
TOKEN="${1:-${GITHUB_TOKEN:-}}"

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

# Zorg dat we in ~/Documents zitten (of huidige map als die schrijfbaar is)
if [ -d "$HOME/Documents" ] && [ "$(pwd)" = "$HOME" ]; then
  cd "$HOME/Documents"
fi

# 1. Xcode Command Line Tools (geeft git)
if ! xcode-select -p >/dev/null 2>&1; then
  log "Xcode Command Line Tools installeren (kan paar minuten duren)..."
  xcode-select --install || true
  echo "Klik 'Installeer' in de popup en wacht tot het klaar is."
  echo "Druk daarna op ENTER om verder te gaan."
  read -r _
fi
ok "git aanwezig: $(git --version)"

# 2. Homebrew
if ! command -v brew >/dev/null 2>&1; then
  log "Homebrew installeren..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # PATH activeren voor Apple Silicon én Intel
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
    echo 'eval "$(/usr/local/bin/brew shellenv)"' >> "$HOME/.zprofile"
  fi
fi
ok "Homebrew aanwezig: $(brew --version | head -1)"

# 3. Node + npm
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  log "Node.js installeren via Homebrew..."
  brew install node
fi
ok "Node aanwezig: $(node --version)  npm: $(npm --version)"

# 4. CocoaPods (nodig voor Capacitor iOS)
if ! command -v pod >/dev/null 2>&1; then
  log "CocoaPods installeren..."
  brew install cocoapods
fi
ok "CocoaPods aanwezig: $(pod --version)"

if ! command -v xcrun >/dev/null 2>&1 || ! xcrun devicectl --help >/dev/null 2>&1; then
  err "Apple devicectl ontbreekt. Installeer/update Xcode 15+ en draai daarna opnieuw."
  err "Gestopt: ik open geen Xcode, Chrome, Safari of preview."
  exit 1
fi

# 5. Repo clonen of updaten — overslaan als we al in een project met package.json + .git zitten
if [ -f "package.json" ] && [ -d ".git" ]; then
  ok "Bestaand project gedetecteerd in $(pwd) — clone overgeslagen."
else
  if [ -d "${REPO_DIR}/.git" ]; then
    log "Repo bestaat al — laatste wijzigingen ophalen..."
    git -C "${REPO_DIR}" pull --ff-only || true
  else
    log "Repo klonen..."
    if [ -n "${TOKEN}" ]; then
      git clone "https://${TOKEN}@github.com/${REPO_USER}/${REPO_NAME}.git" "${REPO_DIR}"
    else
      git clone "https://github.com/${REPO_USER}/${REPO_NAME}.git" "${REPO_DIR}" || {
        err "Clone mislukt. Repo is mogelijk privé."
        err "Voer opnieuw uit met token: GITHUB_TOKEN=ghp_xxx bash $0"
        exit 1
      }
    fi
  fi
  cd "${REPO_DIR}"
fi

# 6. Dependencies + build
log "npm install..."
npm install

log "npm run build..."
BROWSER=none npm_config_browser=none CI=1 npm run build

log "Capacitor index.html maken..."
node scripts/create-capacitor-index.mjs

# 7. Capacitor iOS
log "Capacitor CLI controleren..."
if ! npx --no-install cap --version >/dev/null 2>&1; then
  npm install --save-dev @capacitor/cli
fi

if [ ! -f "capacitor.config.ts" ] && [ ! -f "capacitor.config.json" ]; then
  log "Capacitor initialiseren..."
  APP_NAME="$(node -p "require('./package.json').name")"
  APP_ID="app.lovable.$(echo "${APP_NAME}" | tr -cd '[:alnum:]')"
  cap init "${APP_NAME}" "${APP_ID}" --web-dir=dist/client
fi

if [ ! -d "ios" ]; then
  log "iOS platform toevoegen..."
  npm install @capacitor/ios
  cap add ios
fi

log "Capacitor sync (ios)..."
cap sync ios

# Camera-permissie voor RoomPlan in Info.plist zetten (idempotent)
PLIST="ios/App/App/Info.plist"
if [ -f "${PLIST}" ]; then
  log "Info.plist updaten voor LiDAR/RoomPlan..."
  /usr/libexec/PlistBuddy -c "Set :NSCameraUsageDescription 'Wordt gebruikt om met de LiDAR-scanner ruimtes in 3D op te nemen voor het isolatieplan.'" "${PLIST}" \
    2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :NSCameraUsageDescription string 'Wordt gebruikt om met de LiDAR-scanner ruimtes in 3D op te nemen voor het isolatieplan.'" "${PLIST}"
fi

# iOS deployment target ophogen naar 16 (RoomPlan vereist iOS 16+)
PBXPROJ="ios/App/App.xcodeproj/project.pbxproj"
if [ -f "${PBXPROJ}" ]; then
  log "iOS deployment target verhogen naar 16.0..."
  /usr/bin/sed -i '' -E 's/IPHONEOS_DEPLOYMENT_TARGET = [0-9]+(\.[0-9]+)?;/IPHONEOS_DEPLOYMENT_TARGET = 16.0;/g' "${PBXPROJ}" || true
fi

log "Setup klaar. Native iPad-app starten met browser-vrije runner..."
IOS_SKIP_BUILD=1 IOS_SKIP_SYNC=1 bash scripts/run-ios-native.sh
