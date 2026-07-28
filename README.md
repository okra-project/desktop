# okraPDF for macOS

okraPDF is a private, local-first PDF reader and parser for macOS 13 and later.
It has no account or document library: open a PDF in place, read it, choose a
local parser, and explicitly click **Parse** when you want readable local output.

## Flow

1. Drop a PDF into the window, or choose **Open PDF…** from the workspace sidebar.
2. Read the original PDF in the native center preview. Opening it does not start a run.
3. Choose a local provider in the Extract inspector and click **Parse**.
4. Watch each parser page move through **Not started**, **In progress**, **Done**,
   **Needs attention**, or **Error**; reopen a recent run to restore the same state.
5. Baidu Unlimited-OCR runs draw their detected layout boxes over the source
   PDF and offer a matching block preview, Markdown, and JSON.
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
status, fraction, message, page counts, update time, event sequence, and a
provider-neutral `pageLifecycles` matrix keyed by parser ID plus page number.
`events.jsonl` is the append-only lifecycle stream for cursor-based inspection;
it records start, progress, page checkpoints, cancel intent, interruption,
resume, and terminal outcomes. If the app closes mid-run, the next launch marks
the orphaned attempt interrupted instead of leaving it stuck in `running`.
Resume reuses the same run directory and skips completed Apple Vision or Baidu
page records. A canceled, stalled, or orphaned active page becomes
`attention`; a parser failure becomes `error`; retry returns that page to
`inProgress`; and only a durable page checkpoint becomes `done`. Merely viewing
the run never changes these states. `result.md` is assembled from the page
files in numeric order.

## Local providers

- **Apple Vision** — built into macOS and selected by default.
- **Baidu Unlimited-OCR** — optional 4-bit MLX setup for Apple silicon. The app
  downloads the pinned checkpoint with byte progress, keeps resume data when
  setup is canceled, and verifies every artifact with SHA-256 before marking it
  ready. Extraction is then forced offline. The packaged checkpoint is a
  quantization of `baidu/Unlimited-OCR`. Its output parser decodes tokenizer
  whitespace, converts `<|det|>` spans into typed normalized layout blocks,
  preserves HTML tables and LaTeX, and removes repeated generation tails before
  the result is displayed. Valid boxes are rendered as screen-only PDFKit
  annotations: click a source box or its preview card to select both views, and
  use the toolbar toggle to hide or restore the overlay.

Provider setup may download dependencies and model artifacts once. Extraction
does not make cloud or network calls.

## Friends beta

`desktop-v0.5.0-beta.19` is a prerelease for selected testers using an
Apple-silicon Mac with macOS 13 or later. Processing is local-only. For this
round, use **Apple Vision**: it is built into macOS and requires no model or
Python setup.

Real Baidu Unlimited-OCR setup and inference are outside this testing round.
Baidu simulation, if you encounter it in developer instructions, is internal
workflow QA and is not evidence of OCR quality.

### Install

1. Download `Okra-0.5.0-beta.19.dmg` from the
   [`desktop-v0.5.0-beta.19` GitHub prerelease](https://github.com/okra-project/desktop/releases/tag/desktop-v0.5.0-beta.19).
2. Optionally download the adjacent `.sha256` file and, from the Downloads
   folder, run `shasum -a 256 -c Okra-0.5.0-beta.19.dmg.sha256`.
3. Open the DMG, drag **Okra** to **Applications**, and eject the DMG.
4. Open **Okra** from Finder's Applications folder. The app and DMG are
   Developer ID signed, hardened, notarized by Apple, and stapled for normal
   Gatekeeper opening.

### Five-minute path

1. Open or drop a PDF and confirm that merely opening it does not start
   extraction.
2. Leave **Apple Vision** selected and click **Parse**.
3. Copy the resulting Markdown, then use **Save As** to write a `.md` file.

### Update

The app checks its signed update feed daily. You can also choose **Check for
Updates…** in the app menu to download, verify, install, and relaunch into the
newest beta. If in-app updating fails, download the newer DMG from the
[GitHub Releases page](https://github.com/okra-project/desktop/releases) and
repeat the installation steps above.

### Feedback

For lightweight feedback, reply directly to the maintainer who sent you the
build. For a technical bug, [open a GitHub issue](https://github.com/okra-project/desktop/issues/new)
and include:

- macOS version and Mac model/chip;
- PDF type and page count;
- reproduction steps;
- expected and actual behavior; and
- a screenshot when it helps explain the problem.

Do not attach confidential PDFs or paste sensitive extracted text into a public
issue. Describe the document shape or use a non-sensitive substitute instead.

## Build

```bash
cd apps/desktop
swift build
```

The executable product is `Okra`. Package resources include the local
`ProviderScripts/` installer and worker.

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
output, Baidu output token/layout parsing, PDF bounding-box geometry and
interaction, and a full Baidu Unlimited-OCR simulation through PDF page
rendering, the bundled Python worker, offline flags,
page-level checkpoints, persisted Markdown plus JSON, durable cancel ordering,
orphan recovery, same-run checkpoint resume, provider-process termination, and
all five durable parser/page lifecycle states including multi-parser isolation.
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
./scripts/build-dmg.sh 0.5.0-beta.19
```

The optional second argument is the integer `CFBundleVersion` build number
Sparkle compares (default: UTC minute). Release automation passes the same
build number it records in `appcast.xml`.

The generated app is a normal windowed macOS application. Packaging must not
set `LSUIElement`; the PDF reader belongs in the Dock while it is open.

## Remaining release checks

- Dogfood the complete 2.4 GB Baidu Unlimited-OCR checkpoint download and
  extraction with the network disconnected after setup.
- Dogfood the signed build on a second Mac.
