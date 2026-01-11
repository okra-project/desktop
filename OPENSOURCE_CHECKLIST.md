# Open Source Readiness Checklist

## 🔴 Blockers (Must Fix)

### Secrets & Credentials

- [ ] **`.env` contains Apple signing credentials** - Currently has `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`
- [ ] **Sentry DSN hardcoded** in `src/config/sentry.ts` - Move to env var or make configurable
- [ ] **PostHog API key hardcoded** in `src/renderer/lib/posthog.ts` - Move to env var or make optional

### Proprietary Dependencies

- [ ] **References to `app.okrapdf.com`** in 6 files - Decide: keep as optional cloud backend or remove entirely
  - `src/config/api-config.ts`
  - `src/renderer/store/desktopApi.ts`
  - `src/renderer/components/DocumentBrowser.tsx`
  - `src/renderer/components/AuthScreen.tsx`
  - `src/main/table-extraction.ts` (HTTP-Referer header)

### Licensing

- [x] **Update LICENSE** - Changed to FSL-1.1-ALv2 (Source Available, converts to Apache 2.0 in 2028)
- [ ] **Add license headers** to source files (optional but good practice)

---

## 🟡 Should Fix

### Documentation

- [ ] **Update README.md** - Current README is outdated, doesn't mention BYOK mode
- [ ] **Add CONTRIBUTING.md** - Guidelines for contributors
- [ ] **Add .env.example** - Template without secrets
- [ ] **Document BYOK setup** - How to use with own API keys
- [ ] **Architecture docs** - Explain provider abstraction pattern

### Code Cleanup

- [ ] **Remove dead code** - `AuthScreen.tsx`, `DocumentBrowser.tsx` (non-local versions) if BYOK-only
- [ ] **Remove Clerk references** - If going fully local/BYOK
- [ ] **Clean up console.error logging** - Many `console.error` used for info logging

### Configuration

- [ ] **Make telemetry opt-in by default** - Currently asks but should default to off for OSS
- [ ] **Make Sentry optional** - Should be disabled unless explicitly configured
- [ ] **Externalize all hardcoded URLs** - Use config file or env vars

---

## 🟢 Nice to Have

### Developer Experience

- [ ] **Add DEVELOPMENT.md** - Local dev setup instructions
- [ ] **Add GitHub issue templates** - Bug report, feature request
- [ ] **Add PR template** - Checklist for contributors
- [ ] **Set up GitHub Actions for PRs** - Lint, type-check, test

### Testing

- [ ] **Add unit tests** - Currently minimal coverage
- [ ] **Add E2E tests** - Test PDF extraction, chat flow
- [ ] **Fix existing test setup** - jest-environment-jsdom peer dep issues

### Polish

- [ ] **Add app icon attribution** - If using any third-party icons
- [ ] **Add changelog** - CHANGELOG.md with version history
- [ ] **Create releases page** - GitHub releases with binaries

---

## Current State Summary

| Area                   | Status          | Notes                                         |
| ---------------------- | --------------- | --------------------------------------------- |
| **Core Functionality** | ✅ Working      | BYOK mode fully functional                    |
| **Local-first**        | ✅ Good         | No server required for basic use              |
| **Secrets in Code**    | ❌ Has issues   | Sentry DSN, PostHog key hardcoded             |
| **Secrets in Repo**    | ⚠️ .env exists  | Contains Apple creds (gitignored but risky)   |
| **License**            | ✅ FSL-1.1-ALv2 | Source available, Apache 2.0 in 2028          |
| **Documentation**      | ⚠️ Outdated     | README doesn't reflect current state          |
| **Cloud Dependencies** | ⚠️ Optional     | okrapdf.com refs exist but BYOK works without |
| **Tests**              | ❌ Minimal      | Need more coverage                            |

---

## Recommended OSS Strategy

### Option A: Fully Local (Recommended)

1. Remove all cloud backend references
2. Remove auth (Clerk) completely
3. Ship as pure BYOK app
4. Users bring Anthropic + OpenRouter keys
5. Simple, no vendor lock-in

### Option B: Hybrid

1. Keep cloud as optional
2. Default to BYOK mode
3. Cloud features for paying users
4. More complex to maintain

---

## Quick Wins (Do First)

1. `rm .env` and add `.env` to `.gitignore` (already there, but file exists)
2. Move Sentry DSN to env var, default to disabled
3. Move PostHog key to env var, default to disabled
4. Update LICENSE copyright
5. Update README with BYOK instructions
