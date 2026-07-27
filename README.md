# okraPDF for macOS

okraPDF is a private, local-first PDF reader and parser for macOS 13 and later.
It has no account or document library: open a PDF in place, read it, choose a
local parser, and explicitly click **Parse** when you want Markdown.

## Flow

1. Drop a PDF into the window, or choose **Open PDF…**.
2. Read the original PDF in the native preview. Opening it does not start a run.
3. Choose a local provider in the Extract inspector and click **Parse**.
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
- **Baidu Unlimited-OCR** — optional 4-bit MLX setup for Apple silicon;
  extraction is forced offline. The packaged checkpoint is a quantization of
  `baidu/Unlimited-OCR`.

Provider setup may download dependencies and model artifacts once. Extraction
does not make cloud or network calls.

## Download

Download the Apple-silicon beta from the
[`desktop-v0.5.0-beta.6` GitHub Release](https://github.com/steventsao/okrapdf-desktop/releases/tag/desktop-v0.5.0-beta.6).
The app and DMG are Developer ID signed, hardened, notarized by Apple, and
stapled for normal Gatekeeper opening on other Macs.

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

The retained test surface covers the explicit read-before-parse contract, the
explicit Parse action, run
manifests, provider registration, Apple Vision Markdown output, and a full
Baidu Unlimited-OCR simulation through PDF page rendering, the bundled Python
worker, offline flags, and persisted Markdown.

## Simulate Baidu Unlimited-OCR end to end

Simulation validates the desktop workflow without downloading or loading the
2.4 GB weights. It is visually labeled and never claims to be real OCR.

```bash
./scripts/simulate-unlimited-ocr-e2e.sh /absolute/path/to/document.pdf
```

The script first runs the automated PDF → pages → worker → Markdown → manifest
check against the supplied PDF. It then opens that PDF with **Baidu
Unlimited-OCR** selected. Click **Parse with Baidu Unlimited-OCR** to exercise
the same workflow visibly. You can also run only the built-in fixture check:

```bash
swift test --filter testBaiduUnlimitedOCREndToEndSimulationOnPDF
```

## Package a local beta

```bash
./scripts/build-dmg.sh 0.5.0-beta.6
```

The generated app is a normal windowed macOS application. Packaging must not
set `LSUIElement`; the PDF reader belongs in the Dock while it is open.

## Remaining release checks

- Dogfood Docling setup and extraction on a clean profile.
- Dogfood Baidu Unlimited-OCR with the network disconnected after setup.
- Dogfood the signed build on a second Mac.
