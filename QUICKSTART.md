# OkraPDF Desktop - Quick Start

## Build Installers (Simple Method)

```bash
cd ~/dev/okrapdf-desktop
./build-installer.sh
```

This script will:
1. Clean previous builds
2. Install dependencies
3. Build the application
4. Create installers for your platform

Installers will be in `release/build/`

## Manual Build

```bash
# 1. Install dependencies
npm install --ignore-scripts
npm run build:dll

# 2. Build and package
npm run build
npm run package
```

## What Makes This White-Labeled?

✅ **Pre-configured API Key**: The Anthropic API key in `src/config/api-config.ts` is bundled into the app

✅ **No User Setup**: End users just install and use - no API key configuration needed

✅ **Your Billing**: All AI usage is billed to your Anthropic account

✅ **Branded**: App shows "OkraPDF Desktop" everywhere

## Key Files

- `src/config/api-config.ts` - Contains your pre-configured API key
- `package.json` - App metadata and version
- `src/renderer/components/ChatInterface.tsx` - Main UI with "OkraPDF Desktop" branding
- `src/renderer/index.ejs` - HTML title

## Distribution

After building:

1. **Test**: Run the installer on a clean machine to verify it works
2. **Distribute**: Share the installer files from `release/build/`
3. **Support**: Direct users to support@okrapdf.com for help

## Platform-Specific Installers

- **macOS**: `OkraPDF-*.dmg` - Double-click to install
- **Windows**: `OkraPDF-Setup-*.exe` - Run to install
- **Linux**: `OkraPDF-*.AppImage` - Make executable and run

## Updating the API Key

To change the bundled API key:

1. Edit `src/config/api-config.ts`
2. Update line 11: `ANTHROPIC_API_KEY: 'sk-ant-...'`
3. Rebuild: `./build-installer.sh`

## Troubleshooting

**"Cannot find module" errors**:
```bash
rm -rf node_modules package-lock.json
npm install --ignore-scripts
npm run build:dll
```

**Build succeeds but app won't start**:
- Verify API key in `src/config/api-config.ts` is valid
- Check Console logs in the packaged app

## Next Steps

See [INSTALLATION.md](./INSTALLATION.md) for detailed build instructions and platform-specific notes.
