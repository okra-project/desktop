# okraPDF Desktop — Launch Checklist

The supported desktop product is the `D.6.11` windowed macOS PDF reader and
local parser. It opens a PDF in place, waits for an explicit Parse action, and
returns reviewable source-aligned output.

## Versioning

- Tag format: `desktop-v{MAJOR}.{MINOR}.{PATCH}`.
- Current train: `desktop-v0.5.0-beta.N`.
- `1.0.0` means the parser flow and direct-download distribution are stable.
- Chat, agents, cloud upload, document libraries, channels, and remote control
  are separate products and do not belong in this release train.

## Product gate

- [x] Lightweight windowed SwiftUI PDF reader
- [x] Three-pane local workspace with recent run history
- [x] Open and Finder drag-and-drop
- [x] PDF selection and parsing are separate actions
- [x] Original PDF remains in place
- [x] Apple Vision zero-setup parser
- [x] Optional offline Docling parser
- [x] Optional offline Baidu Unlimited-OCR/MLX parser
- [x] Resumable, byte-counted, SHA-256-verified Baidu model setup
- [x] Truthfully labeled Baidu Unlimited-OCR end-to-end simulation mode
- [x] Baidu bounding boxes rendered over the source PDF with two-way selection
- [x] Accessible Show boxes toolbar toggle with Reduce Motion support
- [x] Markdown copy, save, and reveal
- [x] File-backed `run.json` and `result.md` artifacts
- [x] No account, network workflow, SQLite, policy, agents, or sidecars
- [ ] Clean-profile Docling dogfood with the network disconnected
- [ ] Clean-profile Baidu Unlimited-OCR dogfood on Apple silicon
- [ ] Manual large/scanned/malformed PDF regression pass

## Distribution gate

- [x] App icon and `com.okrapdf.desktop` bundle identifier
- [x] macOS 13 minimum and regular Dock/window lifecycle
- [x] Packaged PDF viewer document type
- [x] Repeatable `./scripts/build-dmg.sh <version>` build
- [x] Developer ID Application certificate available locally
- [x] Hardened-runtime signing
- [x] App and DMG notarization and stapling
- [x] Re-downloaded app and DMG accepted by `spctl` as `Notarized Developer ID`
- [x] Packaged app launch smoke test with builder-only resources hidden
- [x] Sparkle 2 in-app updates: signed `appcast.xml` feed, EdDSA keypair (secret-only private key), Install and Relaunch flow
- [x] Quarantined DMG launch smoke gate through LaunchServices in release automation
- [ ] Second-Mac clean-install verification
- [ ] DMG Applications shortcut and window polish

The app currently has an empty entitlement set. Do not add network, JIT,
unsigned-executable-memory, or library-validation exceptions speculatively.
Add the narrowest entitlement only when a signed distribution build proves it
is required by one of the supported local parsers.

## Release command

```bash
cd apps/desktop
swift test
./scripts/build-dmg.sh 0.5.0-beta.18
```

Do not promote the parser to a stable release until the manual provider checks
and second-Mac install gate are recorded in `RELEASE_CHECKLIST.md`.
