# okraPDF for macOS

okraPDF is a private, local-first PDF reader and parser for macOS 13 and later.
It has no account or document library: open a PDF in place, read it, choose a
local parser, and explicitly click **Parse** when you want readable local output.

## Flow

1. Drop a PDF into the window, or choose **Open PDF…** from the workspace sidebar.
2. Read the original PDF in the native center preview. Opening it does not start a run.
3. Choose a local provider in the Extract inspector and click **Parse**.
4. Reopen a recent run from the sidebar; each run restores its status, progress, and output.
5. Baidu Unlimited-OCR runs offer a rendered block preview, Markdown, and JSON.
6. Cancel a long run without losing finished pages, then resume from its checkpoint.
7. Copy, save, or reveal Markdown or JSON from the inspector.

Nothing is uploaded. Run artifacts stay on the Mac under:

```text
~/Library/Application Support/okraPDF/Runs/{runId}/run.json
~/Library/Application Support/okraPDF/Runs/{runId}/events.jsonl
~/Library/Application Support/okraPDF/Runs/{runId}/result.md
~/Library/Application Support/okraPDF/Runs/{runId}/result.json  # Baidu Unlimited-OCR
~/Library/Application Support/okraPDF/Runs/{runId}/page-progress.json
~/Library/Application Support/okraPDF/Runs/{runId}/page-results/page-0001.md
~/Library/Application Support/okraPDF/Runs/{runId}/page-results/page-0001.json  # Baidu Unlimited-OCR
```

Apple Vision and Baidu Unlimited-OCR checkpoint each completed page to disk
atomically. `run.json` is an atomically replaced, pollable snapshot containing
status, fraction, message, page counts, update time, and event sequence.
`events.jsonl` is the append-only lifecycle stream for cursor-based inspection;
it records start, progress, page checkpoints, cancel intent, interruption,
resume, and terminal outcomes. If the app closes mid-run, the next launch marks
the orphaned attempt interrupted instead of leaving it stuck in `running`.
Resume reuses the same run directory and skips completed Apple Vision or Baidu
page records. `result.md` is assembled from the page files in numeric order.
Docling cancellation terminates its local CLI, but Docling resume restarts the
document because its CLI does not expose trustworthy per-page completion.

## Local providers

- **Apple Vision** — built into macOS and selected by default.
- **Docling** — optional one-time Python/model setup; extraction is forced offline.
- **Baidu Unlimited-OCR** — optional 4-bit MLX setup for Apple silicon. The app
  downloads the pinned checkpoint with byte progress, keeps resume data when
  setup is canceled, and verifies every artifact with SHA-256 before marking it
  ready. Extraction is then forced offline. The packaged checkpoint is a
  quantization of `baidu/Unlimited-OCR`. Its output parser decodes tokenizer
  whitespace, converts `<|det|>` spans into typed normalized layout blocks,
  preserves HTML tables and LaTeX, and removes repeated generation tails before
  the result is displayed.

Provider setup may download dependencies and model artifacts once. Extraction
does not make cloud or network calls.

## Download

Download the Apple-silicon beta from the
[`desktop-v0.5.0-beta.16` GitHub Release](https://github.com/okra-project/desktop/releases/tag/desktop-v0.5.0-beta.16).
The app and DMG are Developer ID signed, hardened, notarized by Apple, and
stapled for normal Gatekeeper opening on other Macs.

From beta.16 on, the app updates itself: it checks a signed update feed daily
and **Check for Updates…** downloads, verifies, and relaunches into the newest
beta without another manual DMG download.

## Build

```bash
cd apps/desktop
swift build
```

The executable product is `Okra`. Package resources include the local
`ProviderScripts/` installers and worker.

## Tests

```bash
bash scripts/verify-brand-surface.sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -p '*_tests.py'
swift test
```

The desktop uses the same mark-only asset as the website and Storybook. App
chrome renders the logo or the `Okra` name, never a logo-plus-wordmark lockup.

The retained test surface covers the explicit read-before-parse contract, the
explicit Parse action, run manifests and history, provider registration, setup
progress/cancellation, pinned-model integrity metadata, Apple Vision Markdown
output, Baidu output token/layout parsing, and a full Baidu Unlimited-OCR
simulation through PDF page rendering, the bundled Python worker, offline flags,
page-level checkpoints, persisted Markdown plus JSON, durable cancel ordering,
orphan recovery, same-run checkpoint resume, and provider-process termination.
A large-document test verifies 120 independently readable page files.

## Simulate Baidu Unlimited-OCR end to end

Simulation validates the desktop workflow without downloading or loading the
2.4 GB weights. It is visually labeled and never claims to be real OCR.

```bash
./scripts/simulate-unlimited-ocr-e2e.sh /absolute/path/to/document.pdf
```

The script first runs the automated PDF → pages → worker → Markdown + JSON → manifest
check against the supplied PDF. It then opens that PDF with **Baidu
Unlimited-OCR** selected. Click **Parse with Baidu Unlimited-OCR** to exercise
the same workflow visibly. You can also run only the built-in fixture check:

```bash
swift test --filter baiduUnlimitedOCREndToEndSimulationOnPDF
```

## Package a local beta

```bash
./scripts/build-dmg.sh 0.5.0-beta.16
```

The optional second argument is the integer `CFBundleVersion` build number
Sparkle compares (default: UTC minute). Release automation passes the same
build number it records in `appcast.xml`.

The generated app is a normal windowed macOS application. Packaging must not
set `LSUIElement`; the PDF reader belongs in the Dock while it is open.

## Remaining release checks

- Dogfood Docling setup and extraction on a clean profile.
- Dogfood the complete 2.4 GB Baidu Unlimited-OCR checkpoint download and
  extraction with the network disconnected after setup.
- Dogfood the signed build on a second Mac.
