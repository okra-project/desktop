# okraPDF Desktop v0.5.0-beta.2

This beta resets the desktop app around one job: turn a local PDF into useful
Markdown without uploading it.

## What is included

- Compact native macOS menu-bar app with no account or Dock icon.
- Open or drop a PDF and parse the original file in place.
- Apple Vision reads an existing PDF text layer first and OCRs scanned pages.
- Optional local Docling and Unlimited-OCR/MLX parsers.
- Copy, Save As, Reveal, progress, and local error states.
- Inspectable `run.json` and `result.md` artifacts under
  `~/Library/Application Support/okraPDF/Runs/`.

## What was removed

The document library, SQLite/GRDB, cloud upload, policy and spend records,
chat, agent harnesses, remote dispatch, WhatsApp sidecars, inspector, and
provider-logo bundle are not part of this app.

## Download and install

1. Download `Okra-0.5.0-beta.2.dmg` below.
2. Open the DMG and copy `Okra.app` into Applications.
3. This internal beta is ad-hoc signed and not notarized. On first launch,
   Control-click or right-click `Okra.app`, choose **Open**, then confirm.

Requirements: Apple-silicon Mac, macOS 13 or later.

Provider setup may download Python packages and model weights once. PDF
parsing runs locally; Docling and Unlimited-OCR are forced into offline mode
after setup.

## Verification

- Debug and release Swift builds passed.
- 4/4 focused tests passed.
- Strict ad-hoc signature verification passed.
- DMG integrity verification passed.
- DMG SHA-256: `16284c07b2afc7ed9ff1e0524ecc374e5e3d91260415c0c8f44aff287e4dde8e`

Clean-profile Docling and Unlimited-OCR dogfood, Developer ID signing, and
notarization remain open before a stable release.
