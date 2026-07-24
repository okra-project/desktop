# okraPDF Desktop Agent Map

## Product boundary

This app is a minimal macOS 13+ menu-bar OCR utility. Do not reintroduce a main
window, tabs, remote control, chat, cloud upload, registries, or backoffice UI.

The supported flow is:

```text
MenuBarExtra → drop/open PDF → local provider → Markdown
```

## Architecture

- `OkraPDF/App.swift` — menu-bar entry point and accessory activation policy
- `OkraPDF/AppState.swift` — open/drop and selected-file actions
- `OkraPDF/ContentView.swift` — compact panel shell and drop target
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
- Apple Vision remains the zero-setup default.
- The source PDF remains in place; do not reintroduce a copied-file library.
- Successful output is normalized to `result.md` beside a small `run.json` manifest.
- Do not add SQLite, cloud fields, policy/spend models, chat, or document agents.
- Use system controls and accessible SF Symbols only for functional affordances.
