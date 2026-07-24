# okraPDF for macOS

okraPDF is a private, lightweight PDF reader and local parser for macOS 13 and
later. Open or drop a PDF, read it in the native window, choose a local parser,
then click **Parse** when you want Markdown. There is no account or document
library.

## Download

Download the Apple-silicon beta from the
[`desktop-v0.5.0-beta.5` GitHub Release](https://github.com/steventsao/okrapdf-desktop/releases/tag/desktop-v0.5.0-beta.5).
The app and DMG are Developer ID signed, hardened, notarized by Apple, and
stapled for normal Gatekeeper opening on other Macs.

## Flow

1. Drop a PDF onto the reader, choose **Open PDF…**, or open a PDF with okraPDF from Finder.
2. Read the PDF and choose a local parser in the inspector.
3. Click **Parse**. Selecting a file never starts parsing on its own.
4. Each run writes a small local manifest and its extracted Markdown.
5. Copy, save, or reveal the resulting Markdown from the inspector.

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
./scripts/build-dmg.sh 0.5.0-beta.5
```

The generated app is a regular windowed macOS application and registers as a
PDF viewer. Published GitHub builds are Developer ID signed, hardened,
notarized by Apple, and stapled.

## Remaining release checks

- Dogfood Docling setup and extraction on a clean profile.
- Dogfood Unlimited-OCR with the network disconnected after setup.
- Dogfood the signed build on a second Mac.
