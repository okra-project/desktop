# okraPDF Desktop v0.5.0-beta.3

This build fixes Gatekeeper installation on other Macs. The app and DMG are
signed with an Apple Developer ID certificate, use the hardened runtime, are
notarized by Apple, and carry stapled notarization tickets.

## Parser

- Native macOS menu-bar app with no account or Dock icon.
- Open or drop a PDF and parse the original file in place.
- Apple Vision reads native PDF text first and OCRs scanned pages.
- Optional local Docling and Unlimited-OCR/MLX parsers.
- Copy, Save As, Reveal, progress, and local error states.
- Inspectable `run.json` and `result.md` artifacts under
  `~/Library/Application Support/okraPDF/Runs/`.

## Install

1. Download `Okra-0.5.0-beta.3.dmg` below.
2. Open it and copy `Okra.app` into Applications.
3. Open Okra normally. Gatekeeper should identify the signed and notarized app
   without the previous malware-verification warning.

Requirements: Apple-silicon Mac, macOS 13 or later.

Provider setup may download Python packages and model weights once. PDF
parsing runs locally; Docling and Unlimited-OCR are forced into offline mode
after setup.

The accompanying `.sha256` asset contains the DMG checksum.
