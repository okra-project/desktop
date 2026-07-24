#!/bin/bash
# Build Okra.app and package as DMG
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:-0.1.0}"
APP_NAME="Okra"
SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-}"
APP_DIR="build/${APP_NAME}.app/Contents"
ICON_SOURCE="OkraPDF/AppIcon.png"
ICON_NAME="AppIcon.icns"
ICON_TMP_ROOT="$(mktemp -d /private/tmp/okra-icon.XXXXXX)"
ICON_PNG="${ICON_TMP_ROOT}/okra-logo-source.png"
ROUNDED_ICON_PNG="${ICON_TMP_ROOT}/okra-logo-rounded.png"
ICONSET_DIR="${ICON_TMP_ROOT}/AppIcon.iconset"

cleanup() {
  rm -rf "${ICON_TMP_ROOT}"
}
trap cleanup EXIT

echo "Building ${APP_NAME} v${VERSION}..."
swift build -c release 2>&1 | tail -3

rm -rf "build/${APP_NAME}.app"
mkdir -p "$APP_DIR/MacOS" "$APP_DIR/Resources"
cp .build/release/Okra "$APP_DIR/MacOS/${APP_NAME}"
cp -R .build/release/okraPDF_Okra.bundle "$APP_DIR/Resources/"

# Normalize the source asset to a real PNG before building the icns.
if [[ ! -f "${ICON_SOURCE}" ]]; then
  echo "Missing app icon source: ${ICON_SOURCE}" >&2
  exit 1
fi

sips -s format png "${ICON_SOURCE}" --out "${ICON_PNG}" >/dev/null
swift scripts/render-app-icon.swift "${ICON_PNG}" "${ROUNDED_ICON_PNG}" >/dev/null
mkdir -p "${ICONSET_DIR}"
for size in 16 32 128 256 512; do
  sips -z "${size}" "${size}" "${ROUNDED_ICON_PNG}" --out "${ICONSET_DIR}/icon_${size}x${size}.png" >/dev/null
  retina=$((size * 2))
  sips -z "${retina}" "${retina}" "${ROUNDED_ICON_PNG}" --out "${ICONSET_DIR}/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "${ICONSET_DIR}" -o "$APP_DIR/Resources/${ICON_NAME}"

# Generate Info.plist with version
cat > "$APP_DIR/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>Okra</string>
    <key>CFBundleIdentifier</key>
    <string>com.okrapdf.desktop</string>
    <key>CFBundleName</key>
    <string>Okra</string>
    <key>CFBundleDisplayName</key>
    <string>Okra</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

# Local builds remain ad-hoc signed. Release automation provides a Developer ID
# Application identity and enables the hardened runtime plus a secure timestamp.
if [[ -n "${SIGNING_IDENTITY}" ]]; then
  codesign \
    --force \
    --options runtime \
    --timestamp \
    --sign "${SIGNING_IDENTITY}" \
    --entitlements okraPDF.entitlements \
    "build/${APP_NAME}.app"
else
  codesign --force --sign - --entitlements okraPDF.entitlements "build/${APP_NAME}.app"
fi

DMG_NAME="${APP_NAME}-${VERSION}.dmg"
rm -f "build/${DMG_NAME}"
hdiutil create -volname "${APP_NAME}" -srcfolder "build/${APP_NAME}.app" -ov -format UDZO "build/${DMG_NAME}" 2>&1

APP_SIZE=$(du -sh "build/${APP_NAME}.app" | cut -f1)
DMG_SIZE=$(du -sh "build/${DMG_NAME}" | cut -f1)
echo ""
echo "${APP_NAME} v${VERSION}"
echo "  .app: ${APP_SIZE} (build/${APP_NAME}.app)"
echo "  .dmg: ${DMG_SIZE} (build/${DMG_NAME})"
