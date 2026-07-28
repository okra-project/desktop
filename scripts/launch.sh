#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

if [ "${1-}" = "--rebuild" ]; then
  shift
  xcodebuild -scheme okraPDF -configuration Debug -destination 'platform=macOS' build
fi

if ! command -v swift >/dev/null 2>&1; then
  echo "swift toolchain not found" >&2
  exit 1
fi

BUILD_DIR="$(swift build --package-path "$PROJECT_ROOT" --show-bin-path)"
APP_BIN="$BUILD_DIR/Okra"

if [ ! -x "$APP_BIN" ]; then
  swift build --package-path "$PROJECT_ROOT" --product Okra -c debug
  BUILD_DIR="$(swift build --package-path "$PROJECT_ROOT" --show-bin-path)"
  APP_BIN="$BUILD_DIR/Okra"
fi

pkill -f '/Volumes/Okra/Okra.app/Contents/MacOS/Okra' 2>/dev/null || true

osascript -e 'tell application "Okra" to activate' >/dev/null 2>&1 || true
exec "$APP_BIN" "$@"
