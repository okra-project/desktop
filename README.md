# OkraPDF Desktop

Local-first PDF processing with AI. Bring your own API keys - no cloud required.

## Features

- **100% Local** - PDFs never leave your computer
- **BYOK (Bring Your Own Key)** - Use your Anthropic and OpenRouter API keys
- **PDF Text Extraction** - Automatic OCR using pdfjs-dist
- **Table Extraction** - Vision AI extracts tables to Markdown (via OpenRouter/Qwen)
- **Chat with PDFs** - Ask questions about your documents using Claude
- **Review Mode** - View and edit extracted text page-by-page
- **No Account Required** - No signup, no cloud sync, no tracking

## Quick Start

1. Download from [Releases](https://github.com/nicepkg/okrapdf-desktop/releases)
2. Open the app and go to Settings
3. Add your API keys:
   - **Anthropic API Key** (required) - For Claude chat
   - **OpenRouter API Key** (optional) - For table extraction
4. Open a PDF and start chatting

## API Keys

| Provider | Purpose | Get Key |
|----------|---------|---------|
| Anthropic | Chat with Claude | [console.anthropic.com](https://console.anthropic.com/) |
| OpenRouter | Table extraction (Qwen Vision) | [openrouter.ai](https://openrouter.ai/) |

## Development

```bash
# Clone
git clone https://github.com/nicepkg/okrapdf-desktop.git
cd okrapdf-desktop

# Install
pnpm install

# Run
pnpm start

# Build
pnpm run package
```

## Release (repeatable)

```bash
# Clean local build outputs
rm -rf release/build

# Install deps and build installers
./build-installer.sh
```

Artifacts are written to `release/build/` (DMG, EXE, AppImage). For a manual build sequence, see `QUICKSTART.md`.

## Architecture

```
~/.okrapdf/workspaces/{id}/
├── source.pdf          # Original PDF
├── metadata.json       # Document info
├── thumbnail.png       # Preview image
├── ocr/               # Extracted text per page
│   └── page-001.md
└── tables/            # Extracted tables
    └── table-p1-1.md
```

## Privacy

- No telemetry by default
- No cloud backend
- All processing happens locally
- API calls go directly to Anthropic/OpenRouter

## Network Dependencies

The application connects to the following services:

- **okrapdf.com**: Checks for application updates and provides download links.
- **api.anthropic.com**: Chat functionality (direct connection using your API key).
- **openrouter.ai**: Table extraction (direct connection using your API key).
- **sentry.io**: Error reporting (if enabled).
- **app.posthog.com**: Telemetry (if enabled).

## License

MIT - see [LICENSE](LICENSE)
