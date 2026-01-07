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

### Release Process (Manual)

1. **Build**: `npm run package` → outputs to `release/build/`
2. **Upload to GCS**:
   ```bash
   gsutil cp release/build/OkraPDF-*.dmg gs://okrapdf-public/releases/vX.X.X/
   ```
3. **Proxy**: okrapdf's `next.config.ts` rewrites `/download/desktop/*` → GCS
4. **Share link**: `https://okrapdf.com/download/desktop/vX.X.X/OkraPDF-X.X.X-arm64.dmg`

No CI/CD yet. GitHub releases created but repo is private so use GCS for distribution.
