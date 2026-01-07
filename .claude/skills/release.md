# Desktop App Release

Manual release process for OkraPDF Desktop.

## Prerequisites

`.env` file with:
```bash
APPLE_ID=steventsao713@gmail.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=449BD89VDV
```

All 3 vars required. Get app-specific password from https://appleid.apple.com/account/manage

## Build with Signing & Notarization

```bash
cd ~/dev/okrapdf-desktop
rm -rf release/build/*
set -a && source .env && set +a && npm run package
```

Look for `notarization successful` in output.

**Gotcha**: Plain `source .env` doesn't export vars. Use `set -a` to auto-export.

## Verify Before Upload

```bash
# Must say "Notarized Developer ID"
spctl -a -vvv release/build/mac-arm64/OkraPDF.app
```

## Upload to GCS

```bash
gsutil -m cp release/build/OkraPDF-*.dmg gs://okrapdf-public/releases/vX.X.X/
```

## Distribution URLs

- **Proxied (public)**: `https://okrapdf.com/download/desktop/vX.X.X/OkraPDF-X.X.X-arm64.dmg`
- **Direct GCS**: `https://storage.googleapis.com/okrapdf-public/releases/vX.X.X/OkraPDF-X.X.X-arm64.dmg`

## Updating Icons

Source logo in `assets/logo-source.jpeg`. To regenerate icons:

```bash
cd assets

# macOS icns (from 1024+ source)
sips -s format png logo-source.jpeg --out icon-1024.png
sips -z 1024 1024 icon-1024.png
mkdir -p icon.iconset
for size in 16 32 128 256 512; do
  sips -z $size $size icon-1024.png --out icon.iconset/icon_${size}x${size}.png
  sips -z $((size*2)) $((size*2)) icon-1024.png --out icon.iconset/icon_${size}x${size}@2x.png
done
iconutil -c icns icon.iconset -o icon.icns

# Windows ico (needs ImageMagick)
magick icon-1024.png -resize 16x16 icon-16.png
magick icon-1024.png -resize 32x32 icon-32.png
magick icon-1024.png -resize 48x48 icon-48.png
magick icon-1024.png -resize 256x256 icon-256.png
magick icon-16.png icon-32.png icon-48.png icon-256.png icon.ico

# Linux png
sips -z 256 256 icon-1024.png --out icon.png

rm -rf icon.iconset icon-1024.png icon-*.png
```

## Next.js Proxy Config (okrapdf repo)

In `next.config.ts`, use `beforeFiles` for external URL rewrites:

```typescript
async rewrites() {
  return {
    beforeFiles: [
      {
        source: '/download/desktop/:path*',
        destination: 'https://storage.googleapis.com/okrapdf-public/releases/:path*',
      },
    ],
    // ...
  };
}
```

**Gotcha**: Default array syntax runs after filesystem check, returns 404 for non-existent paths.

Also add to `middleware.ts` skip list:
```typescript
path.startsWith('/download/') ||  // Public download links
```

## Troubleshooting

**Gatekeeper still warns:**
1. Clean: `rm -rf release/build/*`
2. Delete old app: `rm -rf /Applications/OkraPDF.app`
3. Verify all 3 env vars are set
4. Rebuild and verify with `spctl` before uploading

**401 notarization error:**
- App-specific password expired, generate new one at appleid.apple.com

**Notarization skipped:**
- Missing `APPLE_ID` or `APPLE_TEAM_ID` env vars
- Vars not exported (use `set -a`)

See `~/.claude/skills/electron-macos-signing.md` for certificate setup.
