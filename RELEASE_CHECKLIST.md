# okraPDF Desktop — Release Checklist

Current train: `desktop-v0.5.0-beta.N`

Roadmap item: `D.6.6`

## Product contract

- [x] Windowed app with native PDFKit preview
- [x] Regular activation policy and Dock lifecycle
- [x] Three-pane workspace with current document, recent runs, reader, and extraction inspector
- [x] PDF drag-and-drop
- [x] **Open PDF…** picker
- [x] Explicit Parse action; opening/replacing a PDF creates no run
- [x] Apple Vision default provider
- [x] Docling setup/readiness state
- [x] Baidu Unlimited-OCR setup/readiness state and lineage copy
- [x] Native byte-counted Baidu model download with cancel/resume state
- [x] Pinned Baidu model revision and SHA-256 verification before readiness
- [x] Truthfully labeled Baidu Unlimited-OCR simulation mode
- [x] Streaming progress and local errors
- [x] Cancel Run action with persisted cancel intent and terminal canceled state
- [x] Interrupted-run recovery and same-run Resume action
- [x] Atomic page-level Markdown checkpoints for Apple Vision and Baidu Unlimited-OCR
- [x] Baidu tokenizer-marker decoding and `<|det|>` layout parsing
- [x] Typed normalized blocks in per-page and aggregate `result.json`
- [x] Deterministic repeated-tail suppression with diagnostics
- [x] Preview, Markdown, and JSON output modes for Baidu runs
- [x] Copy, Save As, and Reveal actions for Markdown and JSON
- [x] No cloud upload or remote-control surface

## Persistence and privacy

- [x] Source PDFs remain in place
- [x] No account, library database, cloud metadata, policy, spend, or audit records
- [x] Run lifecycle persisted as `run.json` under Application Support
- [x] Pollable progress snapshots and sequenced lifecycle stream persisted as `run.json` and `events.jsonl`
- [x] Results stored beside each run manifest as `result.md`
- [x] Baidu structured results stored beside each run manifest as `result.json`
- [x] Recent local runs re-open from the workspace sidebar
- [x] Docling inference forces Hugging Face/Transformers offline mode
- [x] Baidu Unlimited-OCR inference forces Hugging Face/Transformers offline mode
- [x] Provider setup is visibly distinct from offline extraction

## Automated verification

- [x] Local-processing tests retained
- [x] Simulated Baidu Unlimited-OCR PDF → pages → worker → Markdown + JSON → manifest E2E
- [x] Mid-run `run.json` progress and 120-page checkpoint persistence coverage
- [x] Cancel ordering, orphan recovery, checkpoint resume, and child-process termination coverage
- [x] Synthetic aToken fixture covers whitespace decoding, malformed markers, normalized boxes, HTML preservation, and repeated-tail suppression
- [x] Default app state constructs every bundled provider without terminating
- [x] Packaged app starts with builder-only SwiftPM resources hidden
- [x] Quarantined notarized beta.8 through beta.11 DMGs start through LaunchServices before publishing (2026-07-27)
- [x] Remote-control, dispatch, registry, and model-catalog tests removed
- [x] `swift build` on an unrestricted macOS shell (2026-07-24)
- [x] Canonical website mark checksum and packaged-resource coverage
- [x] `swift test` on an unrestricted macOS shell (33 tests / 8 suites passed, 2026-07-27)
- [x] Python output-parser and resume tests (5/5 passed, 2026-07-27)

## Manual smoke test

- [x] Launch and confirm the reader window and canonical green Dock icon appear (2026-07-27)
- [ ] Drop a one-page text PDF and confirm no extraction starts
- [ ] Click Parse and confirm Apple Vision starts
- [ ] Drop a multi-page scanned PDF and confirm progress updates by page
- [ ] Copy the output and paste it into a plain-text editor
- [ ] Save the output to a chosen `.md` path
- [ ] Reveal the stored output and source PDF in Finder
- [ ] Switch provider, rerun, and confirm a new run folder and manifest are created
- [ ] Set up Docling on a clean profile and extract with the network disconnected
- [x] Run the labeled Baidu Unlimited-OCR simulation on a multi-page PDF (3 pages, 2026-07-27)
- [ ] Set up Baidu Unlimited-OCR on a 16 GB Apple-silicon Mac and extract offline

## Distribution

- [x] GitHub prerelease `desktop-v0.5.0-beta.5` with DMG and SHA-256 asset (2026-07-24)
- [x] GitHub prerelease `desktop-v0.5.0-beta.6` with DMG and SHA-256 asset (2026-07-27)
- [x] GitHub prerelease `desktop-v0.5.0-beta.7` with DMG and SHA-256 asset (2026-07-27)
- [x] GitHub prerelease `desktop-v0.5.0-beta.8` with startup fix, DMG, and SHA-256 asset (2026-07-27)
- [x] GitHub prerelease `desktop-v0.5.0-beta.9` with canonical mark, page checkpoints, DMG, and SHA-256 asset (2026-07-27)
- [x] GitHub prerelease `desktop-v0.5.0-beta.10` with structured Baidu output, DMG, and SHA-256 asset (2026-07-27)
- [x] GitHub prerelease `desktop-v0.5.0-beta.11` with durable cancel/resume, DMG, and SHA-256 asset (2026-07-27)
- [x] Developer ID Application signature for team `449BD89VDV`
- [x] Hardened runtime
- [x] App and DMG accepted by Apple notarization and stapled
- [x] Re-downloaded app and DMG accepted by `spctl` as `Notarized Developer ID`
- [ ] Second-Mac clean-install DMG pass
