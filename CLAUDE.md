# okraPDF Desktop Agent Map

## Product boundary

This app is a minimal macOS 13+ windowed PDF reader and local document-tool
workspace. Keep one reader window with a text-led local tool registry on the
left and the selected tool's configuration/action inspector on the right. Do
not add tabs, remote control, chat, cloud upload, marketplace/remote registries,
or backoffice UI. The small built-in registry is only navigation and metadata
for operations shipped in the app.

The supported flow is:

```text
open/drop PDF → choose local tool → configure locally → explicit action → review output
```

## Architecture

- `OkraPDF/App.swift` — normal windowed app lifecycle and File menu command
- `OkraPDF/Support/SparkleUpdaterController.swift` — Sparkle in-app updates (signed appcast, Install and Relaunch)
- `OkraPDF/AppState.swift` — open/drop state separated from explicit parsing
- `OkraPDF/ContentView.swift` — PDF reader shell, drop target, and parser inspector
- `OkraPDF/Workspace/` — three-pane shell, built-in tool registry, and selected-tool inspector
- `OkraPDF/PDFReaderView.swift` — native PDFKit reader bridge
- `OkraPDF/LocalProcessing/` — provider contracts, setup, coordinator, and output UI
- `OkraPDF/ProviderScripts/` — bundled Docling/MLX setup and worker scripts

## Build and test

```bash
swift build
swift test
```

Do not start a dev server or watch process.

## Product rules

- User-facing brand copy is always `okraPDF`.
- Extraction is local. Only explicit provider setup may download dependencies.
- Opening or replacing a PDF must never start parsing; only the Parse action may run a provider.
- Tool selection is navigation only and must never start setup or processing.
- Apple Vision remains the zero-setup default.
- The source PDF remains in place; do not reintroduce a copied-file library.
- Successful output is normalized to `result.md` beside a small `run.json` manifest.
  Baidu Unlimited-OCR also writes `result.json` with typed blocks and normalized
  top-left layout boxes. Valid Baidu boxes render as removable, screen-only
  PDFKit annotations over the source PDF and support two-way selection with the
  block preview; do not expose raw tokenizer artifacts or mutate the source PDF.
- Do not add SQLite, cloud fields, policy/spend models, chat, or document agents.
- Use system controls and accessible SF Symbols only for functional affordances.
