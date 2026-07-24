# okraPDF Desktop — Release Checklist

Current train: `desktop-v0.5.0-beta.N`

Roadmap item: `D.6.2`

## Product contract

- [x] Regular windowed app with Dock presence
- [x] Native PDFKit reader
- [x] Narrow parser inspector
- [x] PDF drag-and-drop
- [x] **Open PDF…** picker
- [x] File selection never starts extraction
- [x] Explicit **Parse** action
- [x] Apple Vision default provider
- [x] Docling setup/readiness state
- [x] Unlimited-OCR setup/readiness state
- [x] Streaming progress and local errors
- [x] Selectable Markdown output
- [x] Copy, Save As, and Reveal actions
- [x] No cloud upload or remote-control surface

## Persistence and privacy

- [x] Source PDFs remain in place
- [x] No account, library database, cloud metadata, policy, spend, or audit records
- [x] Run lifecycle persisted as `run.json` under Application Support
- [x] Results stored beside each run manifest as `result.md`
- [x] Docling inference forces Hugging Face/Transformers offline mode
- [x] Unlimited-OCR inference forces Hugging Face/Transformers offline mode
- [x] Provider setup is visibly distinct from offline extraction

## Automated verification

- [x] Local-processing tests retained
- [x] Remote-control, dispatch, registry, and model-catalog tests removed
- [x] `swift build` on an unrestricted macOS shell (2026-07-24)
- [x] `swift test` on an unrestricted macOS shell (6/6 passed, 2026-07-24)
- [x] Launch Services opened a real PDF in the packaged app without creating a run artifact

## Manual smoke test

- [ ] Launch and confirm a normal reader window and Dock icon appear
- [ ] Open and drop PDFs and confirm each displays without starting a run
- [ ] Click **Parse** and confirm Apple Vision starts only then
- [ ] Drop a multi-page scanned PDF and confirm progress updates by page
- [ ] Copy the output and paste it into a plain-text editor
- [ ] Save the output to a chosen `.md` path
- [ ] Reveal the stored output and source PDF in Finder
- [ ] Switch provider, rerun, and confirm a new run folder and manifest are created
- [ ] Set up Docling on a clean profile and extract with the network disconnected
- [ ] Set up Unlimited-OCR on a 16 GB Apple-silicon Mac and extract offline

## Distribution

- [x] Developer ID Application signing identity and private key available to the protected release workflow
- [x] Hardened runtime, app notarization, DMG notarization, and stapling proven by `desktop-v0.5.0-beta.4`
- [ ] Repeat signed/notarized validation for the windowed `desktop-v0.5.0-beta.5` build
- [ ] Clean-install DMG pass
