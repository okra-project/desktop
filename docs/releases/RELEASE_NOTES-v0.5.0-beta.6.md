# okraPDF Desktop v0.5.0-beta.6

This beta polishes the native PDF reader and adds a trustworthy end-to-end
simulation path for Baidu Unlimited-OCR on Apple silicon.

## What changed

- Refined the windowed PDFKit reader, drag-and-drop state, extraction inspector,
  local-status copy, result actions, and accessibility labels.
- Kept parsing explicit: opening, dropping, or replacing a PDF never starts an
  OCR run.
- Identifies the optional MLX provider as **Baidu Unlimited-OCR** and records
  whether each run used the real local runtime or the simulation path.
- Adds a visibly labeled simulation mode that exercises PDF page rendering, the
  bundled Python worker, offline environment flags, Markdown generation, and
  `run.json` persistence without loading the 2.4 GB model weights.
- Adds `scripts/simulate-unlimited-ocr-e2e.sh` for testing the full simulated
  workflow against any local PDF before opening it in the app.

## Validation

- 9 focused Swift tests pass, including read-before-parse behavior, the explicit
  Parse action, and simulated
  Baidu Unlimited-OCR PDF-to-Markdown processing.
- The simulated provider passed against both its generated two-page fixture and
  an existing three-page PDF fixture.
- Release packaging keeps PDF file registration, a normal Dock/window lifecycle,
  and the hardened-runtime signing/notarization path used by previous betas.

Real Baidu Unlimited-OCR quality evaluation still requires downloading the model
and is intentionally separate from the simulation contract.
