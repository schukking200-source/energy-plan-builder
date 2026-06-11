#!/usr/bin/env bash
# Setup script: kloont de repo, installeert dependencies, bouwt de app
# en configureert Capacitor voor iOS.
#
# Gebruik:
#   ./scripts/setup-ios.sh [GITHUB_TOKEN]
#
# Of zet vooraf een token in je shell:
#   export GITHUB_TOKEN=ghp_xxx
#   ./scripts/setup-ios.sh
#
# Als de repo publiek is heb je geen token nodig.

set -euo pipefail

REPO_USER="schukking200-source"
REPO_NAME="isolatie-opname-app"
REPO_DIR="${REPO_NAME}"
TOKEN="${1:-${GITHUB_TOKEN:-}}"

log() { printf "\n\033[1;34m==>\033[0m %s\n" "$*"; }
err() { printf "\n\033[1;31m✗\033[0m %s\n" "$*" >&2; }

# 1. Check vereiste tools
log "Vereisten controleren (git, node, npm)..."
if ! command -v git >/dev/null 2>&1; then
  err "git is niet geïnstalleerd. Installeer Xcode Command Line Tools: xcode-select --install"
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  err "Node/npm ontbreekt. Installeer met Homebrew:  brew install node"
  err "Geen Homebrew? Zie https://brew.sh"
  exit 1
fi

# 2. Clone (of update) repo
if [ -d "${REPO_DIR}/.git" ]; then
  log "Repo bestaat al — laatste wijzigingen ophalen..."
  git -C "${REPO_DIR}" pull --ff-only
else
  log "Repo klonen..."
  if [ -n "${TOKEN}" ]; then
    git clone "https://${TOKEN}@github.com/${REPO_USER}/${REPO_NAME}.git" "${REPO_DIR}"
  else
    git clone "https://github.com/${REPO_USER}/${REPO_NAME}.git" "${REPO_DIR}" || {
      err "Clone mislukt. Repo is mogelijk privé."
      err "Voer opnieuw uit met token: ./scripts/setup-ios.sh ghp_xxx"
      err "Of zet de repo op Public in GitHub instellingen."
      exit 1
    }
  fi
fi

cd "${REPO_DIR}"

# 3. Dependencies
log "npm install..."
npm install

# 4. Build
log "npm run build..."
npm run build

# 5. Capacitor iOS
log "Capacitor CLI controleren..."
if ! npx --no-install cap --version >/dev/null 2>&1; then
  log "@capacitor/cli installeren..."
  npm install --save-dev @capacitor/cli
fi

if [ ! -f "capacitor.config.ts" ] && [ ! -f "capacitor.config.json" ]; then
  log "Capacitor initialiseren..."
  APP_NAME="$(node -p "require('./package.json').name")"
  APP_ID="app.lovable.$(echo "${APP_NAME}" | tr -cd '[:alnum:]')"
  npx cap init "${APP_NAME}" "${APP_ID}" --web-dir=dist
fi

if [ ! -d "ios" ]; then
  log "iOS platform toevoegen..."
  npm install @capacitor/ios
  npx cap add ios
fi

log "Capacitor sync (ios)..."
npx cap sync ios

log "Xcode openen..."
npx cap open ios

log "Klaar! De iOS-app is nu open in Xcode."
