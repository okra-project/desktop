# okraPDF Desktop — Release Checklist

Current train: `desktop-v0.5.0-beta.N`

Roadmap item: `D.6.1`

## Product contract

- [x] Menu-bar-only app (`MenuBarExtra`, `.window` style)
- [x] Accessory activation policy and packaged `LSUIElement`
- [x] Compact 420-point panel
- [x] PDF drag-and-drop
- [x] **Open PDF…** picker
- [x] Immediate extraction after file selection
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
- [x] `swift test` on an unrestricted macOS shell (4/4 passed, 2026-07-24)

## Manual smoke test

- [ ] Launch and confirm no Dock icon appears
- [ ] Click the menu-bar icon and confirm the compact panel opens
- [ ] Drop a one-page text PDF and confirm Apple Vision starts immediately
- [ ] Drop a multi-page scanned PDF and confirm progress updates by page
- [ ] Copy the output and paste it into a plain-text editor
- [ ] Save the output to a chosen `.md` path
- [ ] Reveal the stored output and source PDF in Finder
- [ ] Switch provider, rerun, and confirm a new run folder and manifest are created
- [ ] Set up Docling on a clean profile and extract with the network disconnected
- [ ] Set up Unlimited-OCR on a 16 GB Apple-silicon Mac and extract offline

## Distribution

- [ ] Developer ID signing — **blocked:** no `Developer ID Application` certificate with a private key exists in any local keychain (only App Store `Apple Distribution` / `Apple Development` identities for team 449BD89VDV; audited 2026-07-23, see `internal/releases/desktop/v0.5.0-beta.1-verification.md`). Do not repurpose other credentials; create/download the Developer ID Application cert to unblock.
- [ ] Hardened runtime — blocked on the same Developer ID certificate
- [ ] Notarization — blocked on the same Developer ID certificate (an App Store Connect API key exists locally at `~/private_keys/AuthKey_KQ4H3Z3X7Y.p8`, but no saved notarytool profile/issuer is configured)
- [ ] Clean-install DMG pass
