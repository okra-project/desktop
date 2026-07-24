# okraPDF for macOS

okraPDF is a private menu-bar PDF parser for macOS 13 and later. It has no Dock
icon, account, document library, or main window: click the menu-bar icon, drop a
PDF, and copy or save the extracted Markdown.

## Download

Download the Apple-silicon beta from the
[`desktop-v0.5.0-beta.4` GitHub Release](https://github.com/steventsao/okrapdf-desktop/releases/tag/desktop-v0.5.0-beta.4).
The app and DMG are Developer ID signed, hardened, notarized by Apple, and
stapled for normal Gatekeeper opening on other Macs.

## Flow

1. Open the `text.viewfinder` menu-bar item.
2. Drop a PDF onto the 420-point panel, or choose **Open PDF…**.
3. The selected local provider starts immediately. The source PDF stays where it is.
4. Each run writes a small local manifest and its extracted Markdown.
5. Copy, save, or reveal the resulting Markdown from the panel.

Nothing is uploaded. Run artifacts stay on the Mac under:

```text
~/Library/Application Support/okraPDF/Runs/{runId}/run.json
~/Library/Application Support/okraPDF/Runs/{runId}/result.md
```

## Local providers

- **Apple Vision** — built into macOS and selected by default.
- **Docling** — optional one-time Python/model setup; extraction is forced offline.
- **Unlimited-OCR** — optional MLX setup for Apple silicon; extraction is forced offline.

Provider setup may download dependencies and model artifacts once. Extraction
does not make cloud or network calls.

## Build

```bash
cd apps/desktop
swift build
```

The executable product is `Okra`. Package resources include the local
`ProviderScripts/` installers and worker.

## Tests

```bash
swift test
```

The retained test surface covers run manifests, provider registration, and
Apple Vision Markdown output.

## Package a local beta

```bash
./scripts/build-dmg.sh 0.5.0-beta.4
```

The generated app sets `LSUIElement` and also uses activation policy
`.accessory`, so it remains a menu-bar-only utility. Published GitHub builds
are Developer ID signed, hardened, notarized by Apple, and stapled.

## Remaining release checks

- Dogfood Docling setup and extraction on a clean profile.
- Dogfood Unlimited-OCR with the network disconnected after setup.
- Dogfood the signed build on a second Mac.
