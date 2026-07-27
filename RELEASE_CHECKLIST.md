# okraPDF Desktop — Release Checklist

Current train: `desktop-v0.5.0-beta.N`

Roadmap item: `D.6.3`

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
- [x] Selectable Markdown output
- [x] Copy, Save As, and Reveal actions
- [x] No cloud upload or remote-control surface

## Persistence and privacy

- [x] Source PDFs remain in place
- [x] No account, library database, cloud metadata, policy, spend, or audit records
- [x] Run lifecycle persisted as `run.json` under Application Support
- [x] Results stored beside each run manifest as `result.md`
- [x] Recent local runs re-open from the workspace sidebar
- [x] Docling inference forces Hugging Face/Transformers offline mode
- [x] Baidu Unlimited-OCR inference forces Hugging Face/Transformers offline mode
- [x] Provider setup is visibly distinct from offline extraction

## Automated verification

- [x] Local-processing tests retained
- [x] Simulated Baidu Unlimited-OCR PDF → pages → worker → Markdown → manifest E2E
- [x] Remote-control, dispatch, registry, and model-catalog tests removed
- [x] `swift build` on an unrestricted macOS shell (2026-07-24)
- [x] `swift test` on an unrestricted macOS shell (14 named tests / 16 cases passed, 2026-07-27)

## Manual smoke test

- [x] Launch and confirm the reader window and Dock icon appear (2026-07-27)
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
- [ ] GitHub prerelease `desktop-v0.5.0-beta.7` with DMG and SHA-256 asset
- [x] Developer ID Application signature for team `449BD89VDV`
- [x] Hardened runtime
- [x] App and DMG accepted by Apple notarization and stapled
- [x] Re-downloaded app and DMG accepted by `spctl` as `Notarized Developer ID`
- [ ] Second-Mac clean-install DMG pass
