# okraPDF Desktop — Launch Checklist

The supported desktop product is the `D.6.1` parser-only macOS menu-bar
utility. It opens a PDF in place, runs a local parser, and returns Markdown.

## Versioning

- Tag format: `desktop-v{MAJOR}.{MINOR}.{PATCH}`.
- Current train: `desktop-v0.5.0-beta.N`.
- `1.0.0` means the parser flow and direct-download distribution are stable.
- Chat, agents, cloud upload, document libraries, channels, and remote control
  are separate products and do not belong in this release train.

## Product gate

- [x] Menu-bar-only SwiftUI app with no Dock icon
- [x] Open and Finder drag-and-drop
- [x] Original PDF remains in place
- [x] Apple Vision zero-setup parser
- [x] Optional offline Docling parser
- [x] Optional offline Unlimited-OCR/MLX parser
- [x] Markdown copy, save, and reveal
- [x] File-backed `run.json` and `result.md` artifacts
- [x] No account, network workflow, SQLite, policy, agents, or sidecars
- [ ] Clean-profile Docling dogfood with the network disconnected
- [ ] Clean-profile Unlimited-OCR dogfood on Apple silicon
- [ ] Manual large/scanned/malformed PDF regression pass

## Distribution gate

- [x] App icon and `com.okrapdf.desktop` bundle identifier
- [x] macOS 13 minimum and packaged `LSUIElement=true`
- [x] Repeatable `./scripts/build-dmg.sh <version>` build
- [x] Developer ID Application certificate available locally
- [x] Hardened-runtime signing
- [x] App and DMG notarization and stapling
- [x] Re-downloaded app and DMG accepted by `spctl` as `Notarized Developer ID`
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
./scripts/build-dmg.sh 0.5.0-beta.4
```

Do not promote the parser to a stable release until the manual provider checks
and second-Mac install gate are recorded in `RELEASE_CHECKLIST.md`.
