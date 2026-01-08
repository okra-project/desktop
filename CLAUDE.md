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

### Anthropic API Proxy (Jan 2026)

**Problem**: Desktop app needs to call Claude API but users shouldn't need their own API key.

**Solution**: Route through okrapdf.com proxy that injects server's API key.

**How it works**:
1. Desktop sets `ANTHROPIC_BASE_URL=https://okrapdf.com/api`
2. Claude SDK appends `/v1/messages` → calls `https://okrapdf.com/api/v1/messages`
3. Desktop passes Clerk session token as `ANTHROPIC_API_KEY` (SDK sends it as `x-api-key` header)
4. Backend verifies token and proxies to Anthropic with server's real API key

**Critical Clerk gotcha**: `auth({ acceptsToken })` only checks `Authorization: Bearer` header. Anthropic SDK sends token as `x-api-key` header instead. Must use `verifyToken` from `@clerk/backend`:

```typescript
import { verifyToken } from '@clerk/backend';

// Extract token from x-api-key (where Anthropic SDK puts it)
const sessionToken = req.headers.get('x-api-key');

const verified = await verifyToken(sessionToken, {
  secretKey: process.env.CLERK_SECRET_KEY!,
});
const userId = verified.sub;
```

**Route location**: `/api/v1/messages/route.ts` in okrapdf backend (must be in middleware skip list)

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

**Current stable**: v4.9.3

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
