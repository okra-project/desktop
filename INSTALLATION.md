# OkraPDF Desktop - Installation Guide

This guide covers building installers for OkraPDF Desktop with the pre-configured API key.

## Prerequisites

- Node.js 18+ installed
- npm package manager
- Platform-specific build tools:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Windows SDK
  - **Linux**: Standard build tools

## Quick Start

### 1. Install Dependencies

```bash
cd ~/dev/okrapdf-desktop
rm -rf node_modules package-lock.json
npm install --ignore-scripts
npm run build:dll
```

### 2. Build the Application

```bash
# Build the app for production
npm run build

# This creates optimized production builds in the dist/ folder
```

### 3. Create Installers

```bash
# Package the app for your current platform
npm run package

# Installers will be in: release/build/
```

The package command will create:
- **macOS**: `.dmg` installer in `release/build/`
- **Windows**: `.exe` installer in `release/build/`
- **Linux**: `.AppImage` in `release/build/`

## What's Included

The installer bundles:
- ✅ Pre-configured Anthropic API key (no user setup required)
- ✅ All required dependencies
- ✅ Electron runtime
- ✅ React UI components
- ✅ Claude Agent SDK

## API Key Configuration

The API key is pre-configured in `src/config/api-config.ts`. The build process automatically includes this file in the packaged application, so end users never need to:
- Sign up for an Anthropic account
- Generate their own API key
- Configure any environment variables

All AI processing is billed through your API key.

## Distribution

After building, you can distribute the installer files from `release/build/`:

- Share via download links
- Host on your website
- Distribute via app stores (with proper signing)

## Platform-Specific Notes

### macOS
- The app is not code-signed by default
- Users may need to right-click and select "Open" on first launch
- For distribution, consider code signing with an Apple Developer account

### Windows
- The app is not code-signed by default
- Users may see a Windows Defender SmartScreen warning
- For distribution, consider code signing with a valid certificate

### Linux
- AppImage format works on most modern distributions
- Users may need to make the file executable: `chmod +x OkraPDF-*.AppImage`

## Updating the API Key

To update the bundled API key:

1. Edit `src/config/api-config.ts`
2. Update the `ANTHROPIC_API_KEY` value
3. Rebuild and repackage the app

## Testing Before Distribution

```bash
# Test in development mode
npm start

# Test the packaged app before creating installers
npm run package
# Then manually run the app from release/build/
```

## Troubleshooting

### Build fails with "MODULE_NOT_FOUND"
```bash
rm -rf node_modules package-lock.json
npm install --ignore-scripts
npm run build:dll
```

### TypeScript errors during build
```bash
# Clean build artifacts
rm -rf .erb/dll/
npm run build:dll
npm run build
```

### App doesn't start after packaging
- Check that `src/config/api-config.ts` exists and is valid
- Verify the API key is correct
- Check electron logs in the app's Console/DevTools

## Next Steps

After building installers:
1. Test the installer on a clean machine
2. Update version numbers in `package.json`
3. Create release notes
4. Distribute to users

## Support

For build issues, check:
- Node.js version: `node --version` (should be 18+)
- npm version: `npm --version`
- Build logs in `release/build/`
