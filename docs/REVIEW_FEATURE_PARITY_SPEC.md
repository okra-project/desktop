# Review Tab Feature Parity Spec

This document tracks feature parity between okrapdf web review page and okrapdf-desktop review tab.

## Source Reference
- Web: `~/dev/okrapdf/app/app.okrapdf.com/(dashboard)/ocr/[jobId]/review/page.tsx`
- Desktop: `~/dev/okrapdf-desktop/src/renderer/components/review/ReviewTab.tsx`

---

## Feature Checklist

### 1. Layout & Structure

| Feature | Web | Desktop | Status |
|---------|-----|---------|--------|
| Three-panel layout (left/middle/right) | ✓ | ✓ | ✅ Done |
| Resizable panels (react-resizable-panels) | ✓ | Partial | 🟡 CSS resize (left panel) |
| Header with progress bar | ✓ | ✓ | ✅ Done |
| History button in header | ✓ | ✓ | ✅ Done |

### 2. Left Panel - Page Tree Navigator

| Feature | Web | Desktop | Status |
|---------|-----|---------|--------|
| PageNode component | ✓ | ✓ | ✅ Done |
| Status icons (verified/pending/gap/etc) | ✓ | ✓ | ✅ Done |
| Entity counts per page | ✓ | ✓ | ✅ Done |
| Page click navigation | ✓ | ✓ | ✅ Done |
| Filter chips (status filters) | ✓ | ✓ | ✅ Done |
| Filter chips (entity type filters) | ✓ | ✓ | ✅ Done |
| Expand/collapse all buttons | ✓ | ✓ | ✅ Done |
| Resolution badge on pages | ✓ | ✓ | ✅ Done |
| Stale indicator | ✓ | ✓ | ✅ Done |

### 3. Middle Panel - PDF Viewer

| Feature | Web | Desktop | Status |
|---------|-----|---------|--------|
| PDF display | ✓ | ✓ | ✅ Done |
| Page navigation (prev/next) | ✓ | ✓ | ✅ Done |
| Page indicator (N/Total) | ✓ | ✓ | ✅ Done |
| PageVerificationControl button | ✓ | ✓ | ✅ Done |
| Zoom controls | ✓ | ✓ | ✅ Done |
| Entity overlays on PDF | ✓ | ✓ | ✅ Done |
| OCR block overlays | ✓ | ✗ | ❌ TODO |
| Layer visibility toggles | ✓ | ✓ | ✅ Done |
| Click entity → popover | ✓ | ✓ | ✅ Done |

### 4. Right Panel - Page Content

| Feature | Web | Desktop | Status |
|---------|-----|---------|--------|
| Markdown preview mode | ✓ | ✓ | ✅ Done |
| Markdown edit mode | ✓ | ✓ | ✅ Done |
| Version badge (v2, v3, etc) | ✓ | ✓ | ✅ Done |
| Edited badge | ✓ | ✓ | ✅ Done |
| Save/Cancel buttons | ✓ | ✓ | ✅ Done |
| Character count | ✓ | ✓ | ✅ Done |
| SelectableMarkdownRenderer | ✓ | ✓ | ✅ Done |
| Table cell selection | ✓ | ✓ | ✅ Done |
| "Chat with selection" | ✓ | ✓ | ✅ Done |

### 5. Entity Action Popover

| Feature | Web | Desktop | Status |
|---------|-----|---------|--------|
| EntityActionPopover component | ✓ | ✓ | ✅ Done |
| Table actions (verify schema) | ✓ | ✓ | ✅ Done |
| Figure actions (describe) | ✓ | ✓ | ✅ Done |
| Footnote actions (explain) | ✓ | ✓ | ✅ Done |
| Auto-send to chat | ✓ | ✓ | ✅ Done |

### 6. Docked Chat Interface

| Feature | Web | Desktop | Status |
|---------|-----|---------|--------|
| DockedChat component | ✓ | ✓ | ✅ Done |
| Streaming chat messages | ✓ | ✓ | ✅ Done |
| Message history display | ✓ | ✓ | ✅ Done |
| Table selection mentions | ✓ | ✗ | ❌ TODO |
| Save/Discard agent edits | ✓ | ✓ | ✅ Done |
| Rich markdown input | ✓ | ✗ | ❌ TODO (basic textarea) |

### 7. Table Verification Panel

| Feature | Web | Desktop | Status |
|---------|-----|---------|--------|
| TableVerificationPanel component | ✓ | ✓ | ✅ Done |
| Preview/Edit/Source tabs | ✓ | Partial | 🟡 Needs work |
| Verify/Flag/Reject buttons | ✓ | ✓ | ✅ Done |
| Fix and Accept | ✓ | ✓ | ✅ Done |
| Queue navigation (prev/next) | ✓ | ✓ | ✅ Done |
| Keyboard shortcuts | ✓ | ✓ | ✅ Done |
| Table history timeline | ✓ | ✓ | ✅ Done |
| AI re-extraction | ✓ | ✗ | ❌ TODO |

### 8. History Modal

| Feature | Web | Desktop | Status |
|---------|-----|---------|--------|
| HistoryModal component | ✓ | ✓ | ✅ Done |
| Entry list with actor/entity/state | ✓ | ✓ | ✅ Done |
| Timestamp display | ✓ | ✓ | ✅ Done |
| State badges | ✓ | ✓ | ✅ Done |

### 9. Redux State Management

| Feature | Web | Desktop | Status |
|---------|-----|---------|--------|
| reviewAgentSlice | ✓ | ✓ | ✅ Done |
| qwenViewerSlice (currentPage/scale/overlays) | ✓ | ✗ | ❌ TODO (state in component) |
| verificationSlice | ✓ | ✗ | ❌ N/A (optional) |

### 10. RTK Query Endpoints

| Endpoint | Web | Desktop | Status |
|----------|-----|---------|--------|
| getVerificationTree | ✓ | ✓ | ✅ Done |
| getPageContent | ✓ | ✓ | ✅ Done |
| getEntities | ✓ | ✓ | ✅ Done |
| getTablesByJobId | ✓ | ✓ | ✅ Done |
| getVerificationHistory | ✓ | ✓ | ✅ Done |
| getTableHistory | ✓ | ✓ | ✅ Done |
| savePageVersion | ✓ | ✓ | ✅ Done |
| updateTableStatus | ✓ | ✓ | ✅ Done |
| fixAndAcceptTable | ✓ | ✓ | ✅ Done |
| resolvePageStatus | ✓ | ✓ | ✅ Done |

---

## Implementation Priority

### Phase 1: Core Missing Features (Required)
1. ✅ **PdfPageWithOverlay** - Entity bounding boxes on PDF
2. ✅ **EntityActionPopover** - Context menu on entity click
3. ✅ **Zoom controls** - PDF zoom in/out (already existed)

### Phase 2: AI Integration (Important)
4. ✅ **DockedChat** - AI review agent chat interface
5. ✅ **reviewAgentSlice** - Redux slice for chat state
6. ✅ **SelectableMarkdownRenderer** - Table cell selection
7. ✅ **Chat with selection** - Send selection to agent

### Phase 3: Polish (Nice-to-have)
8. 🟡 **Resizable panels** - CSS resize (basic, left panel only)
9. ✅ **Character count** - Show content length
10. ❌ **AI re-extraction** - Re-extract tables with AI

---

## API Routes Required

All API routes exist under `/api/desktop/`:
- ✅ `/api/desktop/ocr/jobs/[jobId]/verification-tree`
- ✅ `/api/desktop/ocr/jobs/[jobId]/pages/[pageNum]`
- ✅ `/api/desktop/ocr/jobs/[jobId]/entities`
- ✅ `/api/desktop/ocr/jobs/[jobId]/tables`
- ✅ `/api/desktop/ocr/jobs/[jobId]/history`
- ✅ `/api/desktop/ocr/jobs/[jobId]/pages/[pageNum]/resolve`
- ✅ `/api/desktop/refinery/tables/[tableId]`
- ✅ `/api/desktop/refinery/tables/[tableId]/fix`
- ✅ `/api/desktop/refinery/tables/[tableId]/history`
- ✅ `/api/desktop/agents/review` - Agent streaming endpoint

---

## Notes

- Desktop uses Electron's IPC for auth token instead of cookies
- Desktop has its own PDF viewer component (pdfjs-dist based)
- Desktop stores workspace files locally instead of GCS
- Review agent uses same backend API as web (`/api/desktop/agents/review`), powered by Anthropic Claude Haiku 4.5
