# OkraPDF Desktop

## Lessons Learned

### Desktop API Routes (Jan 2026)

**Problem**: Desktop app couldn't fetch library - got 404, then 500 errors.

**Root causes**:
1. `/api/desktop/` routes not in Clerk middleware skip list → 404 (middleware blocked before route ran)
2. Route queried wrong columns from `ocr_jobs` table → 500

**Fixes applied to okrapdf backend**:
1. Added to `middleware.ts` skip list:
   ```typescript
   path.startsWith('/api/desktop/') ||  // Desktop routes handle own auth via acceptsToken
   ```

2. Desktop library route now matches `/api/ocr/jobs` query exactly (not deprecated `/api/library/get`)

### Critical: Data Source

- **ocr_jobs** = Source of truth. Used by `/api/ocr/jobs` (web) and `/api/desktop/library`
- **user_documents** = DEPRECATED. Don't use for new code.

When building desktop API routes, copy from `/api/ocr/*` routes, NOT `/api/library/*`.

### Desktop Auth

Desktop uses Bearer token auth:
```typescript
const { userId } = await auth({ acceptsToken: 'session_token' });
```

Routes must be in middleware skip list to work with Bearer tokens.

### BYOK Mode (Bring Your Own Key) - v5.0+

**Privacy guarantee**: User API keys go **directly to Anthropic** - never through our servers.

**How it works**:
1. User enters Anthropic API key in Settings
2. Key stored locally via electron-store
3. App sets `ANTHROPIC_API_KEY` env var when running Claude SDK
4. Claude SDK calls `https://api.anthropic.com` directly
5. No `ANTHROPIC_BASE_URL` override = no proxy

**Key storage** (current):
- Uses electron-store → stores in `~/Library/Application Support/OkraPDF/config.json`
- Keys stored in plaintext JSON (like most Electron apps)

**Future improvement** (see Dyad's approach):
- Use Electron's `safeStorage.encryptString()` to encrypt before storing
- Decrypt with `safeStorage.decryptString()` when reading
- This encrypts using OS keychain (macOS Keychain, Windows DPAPI)

### Release Process (GHA)

**Before tagging a release:**
1. Bump version in `release/app/package.json` ← **CRITICAL** or DMG filenames won't match tag
2. Commit the version bump

**To release:**
```bash
git tag vX.X.X && git push origin vX.X.X
```

GHA workflow (`.github/workflows/release.yml`) will:
- Build for arm64 + x64
- Upload DMGs to `gs://okrapdf-public/releases/vX.X.X/`

**Download link**: `https://okrapdf.com/download/desktop/vX.X.X/OkraPDF-X.X.X-arm64.dmg`

Proxy: okrapdf's `next.config.ts` rewrites `/download/desktop/*` → GCS

**Current stable**: v5.0.2

### Auto-Updates (Jan 2026)

Uses `electron-updater` with generic provider pointing to GCS via okrapdf.com proxy.

**How it works**:
1. On app launch, checks `https://okrapdf.com/download/desktop/latest-mac.yml`
2. Downloads update `.zip` in background (macOS uses zip, not dmg for updates)
3. Shows native notification: "Version X.X.X will be installed on restart"
4. Auto-installs on app quit

**Files uploaded per release**:
- `*.dmg` - Manual download/install
- `*.zip` - Auto-update payload (REQUIRED for macOS auto-update)
- `latest-mac.yml` - Update manifest

**Logs location** (production builds):
```
~/Library/Logs/electron-react-boilerplate/main.log
```

**Dev builds skip updates** with message:
```
Skip checkForUpdates because application is not packed
```

**First auto-update capable version**: v4.9.12 (earlier versions have wrong publish URL)

### Bundled Runtimes (Fresh Install Support)

App bundles its own runtimes so it works on fresh Mac without Node.js:

- **bun** + **node symlink**: For running Claude Agent SDK CLI
- **uv**: For Python/MCP server support

Build process (`npm run package`):
1. `scripts/beforeBuild.js` runs before electron-builder
2. Downloads bun and uv binaries to `resources/`
3. Creates `node` symlink to `bun`
4. Compiles `.claude/skills/` TypeScript to native binaries
5. All runtimes bundled in app via `extraResources`

At runtime, `main.ts` adds `process.resourcesPath` to PATH so bundled runtimes are found.

### Default Workspace

App creates `~/Desktop/okrapdf` on first launch as the default agent workspace.
Users can drag files here for agent to process.

### Pre-configured Skills

Skills in `.claude/skills/` are compiled at build time and bundled with app:
- **xlsx**: Spreadsheet creation, editing, formula recalculation
- **pdf**: PDF manipulation, text/table extraction, merging/splitting
