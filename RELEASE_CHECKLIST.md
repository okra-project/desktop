# okraPDF Desktop — Release Checklist

Current train: `desktop-v1.0.0-rc.3`

Roadmap items: `Stable #15`, `D.6.9`, `D.6.13`, `D.6.14`

## Product contract

- [x] Windowed app with native PDFKit preview
- [x] Regular activation policy and Dock lifecycle
- [x] Three-pane workspace with current document, recent runs, reader, and extraction inspector
- [x] PDF drag-and-drop
- [x] **Open PDF…** picker
- [x] Explicit Parse action; opening/replacing a PDF creates no run
- [x] Apple Vision default provider
- [x] Auto (Hybrid) native-text reuse with page-local Ollama vision fallback
- [x] Generic Ollama provider with HTTP model discovery and vision-capability filtering
- [x] Ollama model selection persists without inspecting its model directory or invoking its CLI
- [x] Docling provider removed for beta.20
- [x] Baidu Unlimited-OCR setup/readiness state and lineage copy
- [x] Native byte-counted Baidu model download with cancel/resume state
- [x] Pinned Baidu model revision and SHA-256 verification before readiness
- [x] Truthfully labeled Baidu Unlimited-OCR simulation mode
- [x] Streaming progress and local errors
- [x] Canonical per-parser page lifecycle (`idle`, `inProgress`, `done`, `attention`, `error`)
- [x] Lazy page-state strip with parser name, visible text/symbol states, and complete VoiceOver labels
- [x] Passive stall warning after 90 seconds without progress updates
- [x] Low-memory warning while a local run is active
- [x] Cross-instance Baidu Unlimited-OCR run queue with a visible waiting state
- [x] In-app Sparkle auto-update: Check for Updates… downloads, verifies, and relaunches into the newest signed beta
- [x] Cancel Run action with persisted cancel intent and terminal canceled state
- [x] Interrupted-run recovery and same-run Resume action
- [x] Atomic page-level Markdown checkpoints for Apple Vision and Baidu Unlimited-OCR
- [x] Baidu tokenizer-marker decoding and `<|det|>` layout parsing
- [x] Typed normalized blocks in per-page and aggregate `result.json`
- [x] Deterministic repeated-tail suppression with diagnostics
- [x] Preview, Markdown, and JSON output modes for Apple Vision and Baidu runs
- [x] Source-PDF bounding boxes for valid Baidu normalized layout blocks
- [x] Apple Vision structured output and source-PDF boxes for native text and scanned OCR observations
- [x] Provider-neutral source-PDF overlays for Apple Vision and Baidu Unlimited-OCR
- [x] Two-way source-box and preview-card selection across zoom, scroll, crop, and rotation
- [x] Two-way source-box and preview-card hover highlighting, including card scroll-into-view
- [x] Accessible Show boxes toolbar toggle; overlays remain screen-only and never mutate the source PDF
- [x] Copy, Save As, and Reveal actions for Markdown and JSON
- [x] No cloud upload or remote-control surface

## Persistence and privacy

- [x] Source PDFs remain in place
- [x] No account, library database, cloud metadata, policy, spend, or audit records
- [x] Run lifecycle persisted as `run.json` under Application Support
- [x] Pollable progress snapshots and sequenced lifecycle stream persisted as `run.json` and `events.jsonl`
- [x] Parser/page lifecycle matrix persisted in `run.json` with legacy-manifest decoding
- [x] Results stored beside each run manifest as `result.md`
- [x] Apple Vision and Baidu structured results stored beside each run manifest as `result.json`
- [x] Recent local runs re-open from the workspace sidebar
- [x] Baidu Unlimited-OCR inference forces Hugging Face/Transformers offline mode
- [x] Provider setup is visibly distinct from offline extraction
- [x] Ollama is represented as a loopback HTTP integration, separate from Okra-managed Baidu setup

## Automated verification

- [x] Local-processing tests retained
- [x] Simulated Baidu Unlimited-OCR PDF → pages → worker → Markdown + JSON → manifest E2E
- [x] Mid-run `run.json` progress and 120-page checkpoint persistence coverage
- [x] Cancel ordering, orphan recovery, checkpoint resume, and child-process termination coverage
- [x] Lifecycle TDD for transitions, parser isolation, Codable round trips, health attention, cancellation, errors, and completion
- [x] Run-health stall/memory decision logic and cross-process lock queue coverage
- [x] Appcast item insertion, newest-first ordering, and re-run replacement coverage
- [x] Synthetic aToken fixture covers whitespace decoding, malformed markers, normalized boxes, HTML preservation, and repeated-tail suppression
- [x] Provider-neutral PDF overlay adapter, clipping, fixed crop/rotation geometry, annotation ownership, click-selection, and hover-state coverage
- [x] Apple Vision native-text and scanned-observation structured-output coverage
- [x] Default app state constructs every bundled provider without terminating
- [x] Ollama `/api/tags`, `/api/show`, and `/api/chat` request contracts have hermetic unit coverage
- [x] Packaged app starts with builder-only SwiftPM resources hidden
- [x] Quarantined notarized beta.8 through beta.15 DMGs start through LaunchServices before publishing (2026-07-28)
- [x] Remote-control, dispatch, registry, and model-catalog tests removed
- [x] Docling provider, tests, and Docling-only bundled resources removed for beta.20
- [x] `swift build` on an unrestricted macOS shell (2026-07-28)
- [x] Canonical website mark checksum and packaged-resource coverage
- [x] `swift test` on an unrestricted macOS shell (93 tests passed, 2026-07-29)
- [x] Python output-parser, resume, appcast, and protected-release tests (12/12 passed, 2026-07-29)

### Pre-merge CI gate (stable #15)

`.github/workflows/pr-checks.yml` runs on every pull request and push to
`main` so code checks no longer happen only inside the credentialed release
job.

- Secretless: `permissions: contents: read`; no Developer ID, notarization,
  or Sparkle keys are imported. Signing, notarization, stapling, quarantine,
  packaged-launch, appcast signing, and publishing stay exclusive to
  `notarized-release.yml` on `desktop-v*` tags, and a green PR check never
  publishes or mutates `main`.
- Concurrency cancels superseded runs for the same PR/branch ref so the
  constrained self-hosted macOS lane is not wasted on stale commits.
- Each run executes `scripts/verify-brand-surface.sh`, the Python unit suite
  (`scripts/tests`), `swift test`, and `swift build -c release`.
- Tests stay hermetic: `OKRA_DESKTOP_TEST_TMPDIR` routes test workspaces to
  the runner-temporary root, `TestWorkspace` already isolates `UserDefaults`
  suites per test, and no live provider credentials or network inference are
  required.

#### macOS lane maintenance and recovery

- Lane: self-hosted runner `stevens-mac-mini-okrapdf-desktop` on the Mac
  mini, labels `self-hosted, macOS, ARM64, okrapdf-desktop-release`. PR
  checks match on the base labels only; the release job alone claims the
  `okrapdf-desktop-release` label.
- Required toolchains on the lane: Xcode/Swift 5.9+, `rg`, `python3`.
- Inspect runner health: `gh api repos/okra-project/desktop/actions/runners`
  (status should be `online`), or the repo's Settings → Actions → Runners
  page. Failed runs list their logs under the PR Checks workflow.
- Recover an offline runner: on the Mac mini, restart the runner service from
  its install directory (`./svc.sh stop && ./svc.sh start`, or the LaunchDaemon
  equivalent used at install time), then re-check the runners API. If the
  runner needs re-registration, replace it under Settings → Actions → Runners
  with a fresh registration token and the same labels.
- Branch protection: the `macos-checks` job is the required pre-merge check
  for `main`.
- Release appcasts are pushed to a dedicated `automation/appcast-*` branch.
  A maintainer opens that branch as a normal pull request so `macos-checks`
  runs before the signed feed update reaches protected `main`.

## Friend-core manual regression

Run every line below against the exact downloadable beta.19 prerelease
candidate. Record evidence on issue #48; do not use a local build.

- [ ] Open a one-page text PDF and confirm no extraction starts until **Parse** is clicked
- [ ] Replace it with a multi-page scanned PDF and again confirm no automatic extraction
- [ ] Parse both documents with Apple Vision
- [ ] Confirm multi-page progress remains visible and the app stays responsive
- [ ] Copy output and paste it into a plain-text editor
- [ ] Use **Save As** and verify the resulting `.md` file
- [ ] Use **Reveal** and verify both the stored output and source PDF locations
- [ ] Repeat the Apple Vision flow with the network disconnected
- [ ] Try one invalid or corrupt input and confirm the app rejects or reports it without crashing

## Broader product regression

These retained checks do not replace the friend-core lines above. Do not mark
the real-provider checks complete from Baidu simulation, and do not block the
friend round on real Baidu setup/inference.

- [x] Launch and confirm the reader window and canonical green Dock icon appear (2026-07-27)
- [ ] Drop a one-page text PDF and confirm no extraction starts
- [ ] Click Parse and confirm Apple Vision starts
- [ ] Drop a multi-page scanned PDF and confirm progress updates by page
- [ ] Copy the output and paste it into a plain-text editor
- [ ] Save the output to a chosen `.md` path
- [ ] Reveal the stored output and source PDF in Finder
- [ ] Switch provider, rerun, and confirm a new run folder and manifest are created
- [x] Run the labeled Baidu Unlimited-OCR simulation on a multi-page PDF (3 pages, 2026-07-27)
- [ ] Select Baidu boxes from both the PDF and preview on a rotated/cropped dogfood PDF
- [ ] Set up Baidu Unlimited-OCR on a 16 GB Apple-silicon Mac and extract offline

## Distribution

- [x] GitHub prerelease `desktop-v0.5.0-beta.5` with DMG and SHA-256 asset (2026-07-24)
- [x] GitHub prerelease `desktop-v0.5.0-beta.6` with DMG and SHA-256 asset (2026-07-27)
- [x] GitHub prerelease `desktop-v0.5.0-beta.7` with DMG and SHA-256 asset (2026-07-27)
- [x] GitHub prerelease `desktop-v0.5.0-beta.8` with startup fix, DMG, and SHA-256 asset (2026-07-27)
- [x] GitHub prerelease `desktop-v0.5.0-beta.9` with canonical mark, page checkpoints, DMG, and SHA-256 asset (2026-07-27)
- [x] GitHub prerelease `desktop-v0.5.0-beta.10` with structured Baidu output, DMG, and SHA-256 asset (2026-07-27)
- [x] GitHub prerelease `desktop-v0.5.0-beta.11` with durable cancel/resume, DMG, and SHA-256 asset (2026-07-27)
- [x] GitHub prerelease `desktop-v0.5.0-beta.12` with truthful run health, DMG, and SHA-256 asset (2026-07-28)
- [x] GitHub prerelease `desktop-v0.5.0-beta.13` with beta update awareness, DMG, and SHA-256 asset (2026-07-28)
- [x] GitHub prerelease `desktop-v0.5.0-beta.14` on the public okra-project org with DMG and SHA-256 asset (2026-07-28)
- [x] GitHub prerelease `desktop-v0.5.0-beta.15` under the permanent `okra-project/desktop` name with DMG and SHA-256 asset (2026-07-28)
- [x] GitHub prerelease `desktop-v0.5.0-beta.16` with Sparkle in-app updates, signed appcast feed, DMG, and SHA-256 asset (2026-07-28)
- [x] GitHub prerelease `desktop-v0.5.0-beta.17` with Sparkle click-to-restart E2E proof, DMG, SHA-256 asset, and appcast update (2026-07-28)
- [x] GitHub prerelease `desktop-v0.5.0-beta.18` with Baidu source-PDF bounding boxes, DMG, SHA-256 asset, and appcast update (2026-07-28)
- [x] Sparkle.framework embedded, Developer ID signed, notarized, and stapled with the app
- [x] EdDSA update signing: private key in repo secrets only, public key in the bundle
- [x] Developer ID Application signature for team `449BD89VDV`
- [x] Hardened runtime
- [x] App and DMG accepted by Apple notarization and stapled
- [x] Re-downloaded app and DMG accepted by `spctl` as `Notarized Developer ID`
- [x] Public `desktop-v1.0.0-rc.1` prerelease with DMG and SHA-256 assets (2026-07-29)
- [x] Exact RC.1 passes automated signing, notarization, Gatekeeper, DMG, and quarantine-launch gates (2026-07-29)
- [x] Exact RC.1 is re-downloaded, verified, and installed on this MacBook (2026-07-29)
- [ ] Public `desktop-v1.0.0-rc.2` prerelease with generic Ollama HTTP integration
- [ ] RC.2 appcast branch passes `macos-checks` and merges to protected `main`
- [ ] Exact RC.2 is re-downloaded, verified, installed, and dogfooded against local Ollama
- [ ] Public `desktop-v1.0.0-rc.3` prerelease with dark-mode source-box visibility fix
- [ ] RC.3 appcast branch passes `macos-checks` and merges to protected `main`
- [ ] Exact RC.3 is re-downloaded, verified, installed, and dark-mode box visibility confirmed
- [ ] Friend-equivalent clean-Mac install and Apple Vision extraction recorded on issue #47
- [ ] Signed in-place **Install and Relaunch** update evidence recorded on issue #39
