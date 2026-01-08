# Desktop Auth Issue - Debug Writeup

## Problem Summary

Desktop app cannot authenticate with OkraPDF backend. Getting 401 on `POST /api/desktop/token`.

## Architecture

```
Desktop App (Electron)
    |
    | 1. OAuth popup -> accounts.okrapdf.com/sign-in
    | 2. Get __session cookie after redirect to app.okrapdf.com
    | 3. POST /api/desktop/token with Bearer {session_token}
    |
    v
OkraPDF Backend (Next.js + Clerk)
    |
    | 4. auth() extracts userId from session token
    | 5. Creates 30-day Clerk API key
    | 6. Returns API key secret
    |
    v
Desktop stores API key, uses for Claude proxy calls
```

## Current Error

```
POST /api/desktop/token -> 401 Unauthorized
```

## Previous Errors (Fixed)

1. **409 Conflict** - API key name already exists
   - Fixed by using unique timestamped names: `OkraPDF Desktop ${Date.now()}`
   - Clerk enforces name uniqueness even on revoked keys

## Code Locations

### Desktop (okrapdf-desktop)

**OAuth flow**: `src/main/main.ts:36-90`
```typescript
ipcMain.handle('auth:oauth-popup', async () => {
  authWindow.loadURL('https://accounts.okrapdf.com/sign-in');
  // Monitors for redirect to app.okrapdf.com
  // Extracts __session cookie
  // Returns { success: true, token: sessionCookie.value }
});
```

**Token exchange**: `src/main/main.ts:415-478`
```typescript
ipcMain.handle('auth:set-token', async (_event, token: string) => {
  // Stores session token
  // Calls POST /api/desktop/token to get long-lived API key
  const response = await fetch('https://okrapdf.com/api/desktop/token', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  // Stores returned API key for Claude proxy calls
});
```

### Backend (okrapdf)

**Token endpoint**: `app/api/desktop/token/route.ts`
```typescript
export async function POST(request: NextRequest) {
  const { userId } = await auth();  // <-- 401 happens here

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Create API key with unique name
  const keyName = `OkraPDF Desktop ${Date.now()}`;
  const apiKey = await client.apiKeys.create({
    name: keyName,
    subject: userId,
    secondsUntilExpiration: 30 * 24 * 60 * 60,
  });

  return NextResponse.json({ token: apiKey.secret });
}
```

**Middleware**: `middleware.ts`
- Route `/api/desktop/` should be in skip list for Bearer token auth
- Uses `auth({ acceptsToken: 'session_token' })` pattern

## Hypotheses

1. **Session token expired** - Clerk session tokens are short-lived (~60s)
   - Desktop extracts cookie but by time it calls /api/desktop/token, it's expired

2. **Middleware blocking** - `/api/desktop/token` not properly skipped in middleware
   - Should use `acceptsToken: 'session_token'` but might not be configured

3. **Cookie vs Bearer mismatch** - Desktop sends `Authorization: Bearer {token}` but backend expects cookie auth

4. **CORS/domain issue** - Token from accounts.okrapdf.com not valid for okrapdf.com API

## What We Tried

1. ~~Fixed 409 by using unique timestamped key names~~ (worked)
2. ~~Added retry logic for race conditions~~ (worked)
3. ~~Fixed 401 by adding `acceptsToken: 'session_token'` to auth()~~ (pushed fa34a9d)

## Relevant Clerk Docs

- API Keys: https://clerk.com/docs/guides/development/machine-auth/api-keys
- Session tokens: https://clerk.com/docs/backend-requests/handling/manual-jwt
- acceptsToken: https://clerk.com/docs/references/nextjs/auth#accepts-token

## Next Steps

1. Check middleware.ts - ensure `/api/desktop/` routes skip Clerk middleware OR use `acceptsToken`
2. Verify session token format - is it a valid JWT?
3. Add logging to see what auth() receives
4. Consider using Clerk's `getToken()` on frontend instead of raw cookie

## Files to Check

- `okrapdf/middleware.ts` - Clerk middleware config
- `okrapdf/app/api/desktop/token/route.ts` - Token endpoint
- `okrapdf-desktop/src/main/main.ts` - Desktop OAuth flow
