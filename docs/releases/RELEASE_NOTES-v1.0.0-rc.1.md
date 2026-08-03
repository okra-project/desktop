# okraPDF Desktop v1.0.0-rc.1

This is the first public release candidate for okraPDF Desktop v1.0. It is an
Apple-silicon macOS prerelease for validating the exact signed and notarized
artifact before stable promotion. PDF reading and extraction remain local to
the Mac; only an explicitly requested provider setup downloads dependencies or
model artifacts.

## Goal

Validate a reliable local-first desktop parser on a clean supported Mac. This
candidate adds a page-aware **Auto (Hybrid)** path that keeps usable native PDF
text and sends only scanned or broken-text pages to Chandra OCR 2 through a
local Ollama runtime. It also makes every parser page's durable state visible
and enforces the same brand, unit-test, and release-build gate before merge.

## What changed since v0.5.0-beta.20

- **Auto (Hybrid)** applies a deterministic native-text quality gate per page.
  Accepted text is preserved without VLM inference; rejected pages are rendered
  locally and routed to Chandra OCR 2. Markdown and structured JSON record
  `native-text` or `chandra` provenance for every page.
- **Chandra OCR 2** is available as a standalone local parser through Ollama's
  OpenAI-compatible localhost endpoint. Setup pulls a pinned Ollama model and
  creates the `okra-chandra:q4` variant with the document context window used by
  the app. Extraction runs offline after setup.
- Parser definitions now record runtime, model delivery, output adapter,
  capabilities, host requirements, and model lineage in versioned contracts.
- Every participating parser page uses the durable `idle`, `inProgress`,
  `done`, `attention`, or `error` lifecycle. Cancellation and interruption keep
  completed checkpoints and expose truthful resume state.
- Pull requests and pushes to `main` now run the secretless `macos-checks` gate
  on the maintained self-hosted Mac mini: brand verification, Python tests,
  Swift tests, and a release Swift build.

## Supported platform and provider matrix

The published application is arm64-only and supports Apple-silicon Macs running
macOS 13 or later.

| Provider | Setup | Host guidance | Best fit |
| --- | --- | --- | --- |
| Apple Vision | None; built into macOS | Apple silicon, macOS 13+ | Zero-setup text and scanned PDFs |
| Auto (Hybrid) | Ollama plus one-time Chandra setup and about 3.4 GB of model data | 8 GB unified memory minimum, 16 GB recommended, 5 GB free disk | Mixed PDFs; native text when usable, Chandra fallback per page |
| Chandra OCR 2 | Same Ollama/Chandra setup as Auto | 8 GB unified memory minimum, 16 GB recommended, 5 GB free disk | Scanned and layout-heavy PDFs, tables, formulas, and code |
| Baidu Unlimited-OCR | In-app pinned 4-bit MLX model setup, about 2.4 GB | 16 GB unified memory and 3 GB free disk | Experimental structured OCR and layout extraction |

Chandra's model uses a modified OpenRAIL-M license with use restrictions and
share-alike terms. That license is surfaced in the app before setup.

## Install and RC validation

1. Download `Okra-1.0.0-rc.1.dmg` and its adjacent `.sha256` file from the
   [`desktop-v1.0.0-rc.1` GitHub prerelease](https://github.com/okra-project/desktop/releases/tag/desktop-v1.0.0-rc.1).
2. From the download directory, run
   `shasum -a 256 -c Okra-1.0.0-rc.1.dmg.sha256`.
3. Open the DMG, copy **Okra** to **Applications**, eject the DMG, and open
   **Okra** from Applications. The release workflow signs, hardens, notarizes,
   and staples both the app and DMG before publishing them.
4. Confirm that opening a PDF does not start extraction. Use **Apple Vision**
   for the zero-setup path, or install and start Ollama before setting up
   **Auto (Hybrid)** or **Chandra OCR 2**.
5. For Auto validation, test one native-text PDF and one scanned or mixed PDF;
   confirm the output records page provenance and that cancel/resume preserves
   completed pages.

## Known limits

- This is a release candidate, not the v1.0 stable release. Clean-second-Mac
  installation, real-provider dogfooding, and the final promotion decision are
  still required.
- Auto (Hybrid) requires Chandra setup before it becomes selectable, even when
  a particular document ultimately reuses native text on every page.
- Ollama must be installed and running for Chandra setup and inference. The app
  does not bundle Ollama or the Chandra weights.
- Chandra is intentionally page-local and can be slow on scanned documents.
  Only one Chandra worker runs at a time.
- Baidu Unlimited-OCR remains an advanced path; simulation is workflow QA and
  is not evidence of real OCR quality.
- The app has no account, cloud document library, chat, or remote-control
  surface. Source PDFs remain in place and run artifacts remain under the
  user's Application Support directory.

## Feedback and privacy

For a technical issue, [open a GitHub issue](https://github.com/okra-project/desktop/issues/new)
with the macOS version, Mac model/chip, PDF shape and page count, reproduction
steps, and expected versus actual behavior. Do not attach confidential PDFs or
paste sensitive extracted text into a public issue; use a non-sensitive
substitute or describe the document shape.

## Validation and promotion

The tag workflow must pass brand, Python, and Swift tests; package launch;
Developer ID signing; hardened runtime; Apple notarization and stapling;
Gatekeeper assessment; DMG verification; quarantined LaunchServices launch;
checksum generation; and signed Sparkle appcast publication before this
prerelease appears. Stable promotion requires re-downloading this exact RC and
validating it on the clean second Mac.

## Rollout

Publish `desktop-v1.0.0-rc.1` from a commit on `main`, keep it marked as a
prerelease, and validate the exact DMG and checksum. Do not move or reuse the
tag. Promote only an approved `main` lineage to `desktop-v1.0.0`.

## Rollback

`desktop-v0.5.0-beta.20` remains available as the last published signed build.
If this RC regresses, reinstall that DMG, avoid **Check for Updates…**, and fix
forward under a new RC tag. Never replace or retarget the published RC tag.

## Owner

okraPDF desktop maintainers (`Stable #15`, `D.6.9`, okra-project/desktop#15,
okra-project/desktop#38).
