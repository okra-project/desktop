# okraPDF Desktop Agent Map

## Product boundary

This app is a minimal macOS 13+ windowed PDF reader and local parser. Keep one
reader window with one narrow parser inspector. Do not add tabs, remote control,
chat, cloud upload, registries, or backoffice UI.

The supported flow is:

```text
open/drop PDF → read → choose local provider → explicit Parse → Markdown
```

## Architecture

- `OkraPDF/App.swift` — normal windowed app lifecycle and File menu command
- `OkraPDF/AppState.swift` — open/drop state separated from explicit parsing
- `OkraPDF/ContentView.swift` — PDF reader shell, drop target, and parser inspector
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
- Apple Vision remains the zero-setup default.
- The source PDF remains in place; do not reintroduce a copied-file library.
- Successful output is normalized to `result.md` beside a small `run.json` manifest.
- Do not add SQLite, cloud fields, policy/spend models, chat, or document agents.
- Use system controls and accessible SF Symbols only for functional affordances.
