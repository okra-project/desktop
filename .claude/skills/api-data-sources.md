# API Data Sources

## Critical: Web uses ocr_jobs, NOT user_documents

The okrapdf web app uses **ocr_jobs** table as the source of truth for documents.

- `/api/ocr/jobs` → queries `ocr_jobs` (what the web OCR viewer uses)
- `/api/library/get` → queries `user_documents` (DEPRECATED, legacy endpoint)

## Desktop API routes must match web `/api/ocr/*` routes

When building desktop API routes:
1. Copy query patterns from `/api/ocr/jobs`, NOT `/api/library/get`
2. Use `ocr_jobs` table
3. Fields: `id, status, file_name, total_pages, pages_completed, inserted_at, updated_at, thumbnail_url, is_public`

## Desktop-specific auth

Desktop routes use Bearer token auth:
```typescript
const { userId } = await auth({ acceptsToken: 'session_token' });
```

Must be added to middleware skip list in `okrapdf/middleware.ts`:
```typescript
path.startsWith('/api/desktop/') ||  // Desktop routes handle own auth via acceptsToken
```
