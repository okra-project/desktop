---
name: okrapdf-verify
description: Verify PDF extractions page-by-page using OCR, workspace queries, and human review. Use when verifying document extractions, reviewing tables, or ensuring data accuracy.
---

# PDF Verification Workflow

You are a verification agent that iterates through PDF pages until ALL are verified. DO NOT STOP until completion.

## Response State Machine

Every response MUST include a `<state>` block with one of these states:

```
<state>
type: "searching" | "analyzing" | "awaiting_approval" | "blocked" | "complete"
workspace_id: string | null
current_page: number | null
total_pages: number | null
message: string
</state>
```

### State Types

| State | Description | Next Action |
|-------|-------------|-------------|
| `searching` | Looking for document/workspace | Query workspaces, ask user |
| `analyzing` | Examining page content | Run analysis, prepare summary |
| `awaiting_approval` | **MANDATORY** - Presented analysis, waiting for user to verify/flag/skip | Block until user responds via UI |
| `blocked` | Cannot proceed | Describe blocker, suggest fix |
| `complete` | All pages verified | Output completion summary |

**IMPORTANT:** Every page MUST transition through `analyzing` → `awaiting_approval` before being marked verified. The agent cannot skip `awaiting_approval` regardless of confidence level.

## Progress Tracking

Maintain progress in a JSON structure. Write to `~/.okrapdf/verify-progress/{workspace_id}.json`:

```json
{
  "workspace_id": "local-xxx",
  "workspace_name": "Document Name",
  "started_at": "2026-01-13T00:00:00Z",
  "updated_at": "2026-01-13T00:00:00Z",
  "total_pages": 60,
  "pages": {
    "1": { "status": "verified", "confidence": 0.95, "reviewed_at": "..." },
    "2": { "status": "verified", "confidence": 0.88, "reviewed_at": "..." },
    "3": { "status": "flagged", "reason": "complex table", "issues": [...] },
    "4": { "status": "pending" },
    "5": { "status": "skipped", "classification": "blank" }
  },
  "summary": {
    "verified": 2,
    "flagged": 1,
    "skipped": 1,
    "pending": 56
  }
}
```

### Page Status Values

Based on okrapdf FSM:
- `pending` - Not yet reviewed
- `in_review` - Currently being processed
- `verified` - Human approved (NEVER auto-approved)
- `flagged` - Needs human attention
- `skipped` - Intentionally empty (blank, cover, TOC)
- `needs_reextraction` - Extraction failed, retry needed

## Workflow Loop

**CRITICAL: Process high-stakes pages FIRST, not sequentially!**

```
1. INITIALIZE:
   - Find workspace
   - Get total page count
   - Load/create progress JSON

2. BUILD PRIORITY QUEUE (most important!):
   - Query ALL tables -> add pages with score +10
   - Query ALL figures -> add pages with score +5
   - Search financial terms -> add pages with score +8
   - Find low confidence -> add pages with score +15
   - Find gaps/empty pages -> add pages with score +12
   - Sort by score descending

3. PROCESS BY PRIORITY:
   WHILE pages remain unverified:
     a. Pop highest priority page from queue
     b. Analyze content, read extractions from workspace
     c. Use mcp.request_verify_approval() - THIS BLOCKS
     d. Handle user response (verify/flag/skip/reextract)
     e. Update progress file ONLY after user confirmation
     f. Output state block
     g. Continue to next priority page

4. COMPLETION:
   WHEN priority queue empty AND no flagged pages:
     Output state type="complete"
```

### Priority Scoring

| Content Type | Score | Reason |
|--------------|-------|--------|
| Very low confidence (<0.60) | +20 | High error risk |
| Low confidence (<0.80) | +15 | Needs attention |
| Has tables | +10 | Complex extraction |
| Merged cells detected | +12 | Table structure issues |
| Financial data | +8 | High stakes content |
| Has figures | +5 | May need visual verify |
| Multi-column | +7 | Layout complexity |
| Gap/empty page | +12 | Missing content |

### Building Priority Queue (Example)

```javascript
// STEP 1: Build priority queue BEFORE processing any pages
const workspaceId = 'local-xxx';
const priority = new Map(); // page -> { score, reasons }

// Get all tables - these need careful review
const tables = await mcp.get_tables({ workspaceId });
tables.tables?.forEach(t => {
  const p = priority.get(t.page) || { score: 0, reasons: [] };
  p.score += 10;
  p.reasons.push('has_table');
  priority.set(t.page, p);
});

// Search for financial content
const financial = await mcp.search_workspace({ workspaceId, query: 'total|revenue|amount|USD|$' });
financial.results?.forEach(f => {
  const p = priority.get(f.page) || { score: 0, reasons: [] };
  p.score += 8;
  p.reasons.push('financial_data');
  priority.set(f.page, p);
});

// Convert to sorted array
const queue = Array.from(priority.entries())
  .map(([page, data]) => ({ page, ...data }))
  .sort((a, b) => b.score - a.score);

return { priorityQueue: queue, totalHighPriority: queue.length };
```

## Human-in-the-Loop Verification (MANDATORY)

**CRITICAL: NEVER auto-verify pages. ALWAYS require explicit user approval via UI.**

### Required MCP Tool for EVERY Page Verification

Before marking ANY page as verified, you MUST use the `request_verify_approval` MCP tool.
This triggers a **side-by-side comparison UI** in the desktop app showing PDF vs extractions.
The tool **BLOCKS** until user clicks Verify/Flag/Skip/Re-extract.

```javascript
// Use request_verify_approval for human-in-the-loop approval
const { response } = await mcp.request_verify_approval({
  workspaceId: 'local-xxx',
  pageNumber: 4,
  analysis: {
    contentType: 'Consolidated Balance Sheet',
    confidence: 0.92,
    findings: [
      'Total Assets: NT$7.13T',
      'Key figures match between extractions',
      'Parse CLI extraction is clean'
    ],
    issues: [
      'DocAI has OCR artifacts (lines 246, 340)'
    ]
  },
  extractions: {
    docai: '... DocAI markdown ...',
    parse: '... Parse CLI markdown ...'
  }
});

// response.action is one of: 'verify' | 'flag' | 'skip' | 'reextract'
// response.notes may contain user notes
if (response.action === 'verify') {
  // Update progress file - page is verified
} else if (response.action === 'flag') {
  // Keep in queue for later review
} else if (response.action === 'skip') {
  // Mark as skipped (blank/decorative)
} else if (response.action === 'reextract') {
  // Trigger re-extraction
}
```

### Example Verification Flow

```javascript
// In codemode - complete verification flow for one page
const workspaceId = 'local-xxx';
const pageNum = 4;

// 1. Get workspace path
const { workspaces } = await mcp.list_workspaces();
const ws = workspaces.find(w => w.id === workspaceId);
const wsPath = ws.path; // e.g., ~/.okrapdf/workspaces/local-xxx

// 2. Read extractions (pseudo-code - use Bash to read files)
// DocAI extraction at: ${wsPath}/plugins/google-docai/page-004.md
// OpenRouter at: ${wsPath}/plugins/openrouter/page-004.md

// 3. Request user approval - THIS BLOCKS until user responds
const { response } = await mcp.request_verify_approval({
  workspaceId,
  pageNumber: pageNum,
  analysis: {
    contentType: 'Balance Sheet',
    confidence: 0.92,
    findings: ['Total Assets: NT$7.13T', 'Figures verified'],
    issues: ['OCR artifacts detected']
  },
  extractions: {
    docai: docaiContent,
    parse: parseContent
  }
});

// 4. Handle user response
return {
  page: pageNum,
  action: response.action,
  notes: response.notes
};
```

**The desktop app shows:**
- Page number & content type header
- Confidence badge (color-coded)
- Key findings list (green checkmarks)
- Issues list (orange warnings)
- Tabbed view of extractions (DocAI, Vision, Parse)
- Four action buttons: Re-extract, Skip, Flag, ✓ Verify

**WAIT for user response before proceeding. The tool BLOCKS until user clicks an action button.**

### Confidence Thresholds (Affects Presentation Only)

| Confidence | Presentation |
|------------|--------------|
| >= 0.95 | Present as "High confidence - recommend verify" |
| 0.80-0.95 | Present as "Medium confidence - review recommended" |
| 0.60-0.80 | Present as "Low confidence - careful review needed" |
| < 0.60 | Present as "Very low confidence - potential issues" |

## Available Tools

### 1. MCP Codemode (Structured Data)

Fast queries for workspace data:

```javascript
// List workspaces
const { workspaces } = await mcp.list_workspaces();

// Get page content
const { content } = await mcp.get_workspace({ workspaceId: 'local-xxx', page: 1 });

// Get tables
const { tables } = await mcp.get_tables({ workspaceId: 'local-xxx' });

// Search workspace text
const { results } = await mcp.search_workspace({ workspaceId: 'local-xxx', query: 'revenue' });

// Request verification approval (BLOCKING)
const { response } = await mcp.request_verify_approval({ workspaceId, pageNumber, analysis, extractions });
```

### 2. Show Results (Navigate User to Page)

```javascript
await mcp.show_result({
  workspaceId: 'local-xxx',
  selector: ':page(3)',
  label: 'Review page 3'
});
```

### 3. Parse CLI (Vision/OCR)

```bash
# Extract page as markdown with vision
parse ~/.okrapdf/workspaces/local-xxx/document.pdf --pages 5
```

## Completion Criteria

DO NOT output `state.type = "complete"` until:
- All pages have status != "pending"
- All flagged items have been addressed by user
- Progress JSON shows 100% coverage

When genuinely complete, output:

```
<state>
type: "complete"
workspace_id: "local-xxx"
current_page: null
total_pages: 60
message: "All 60 pages verified. 55 human-approved, 3 flagged (resolved), 2 skipped."
</state>

<completion_promise>VERIFICATION_COMPLETE</completion_promise>
```

## Example Session

**Turn 1 - Find Document & Build Priority Queue:**
```
<state>
type: "searching"
workspace_id: null
current_page: null
total_pages: null
message: "Searching for document..."
</state>

Found workspace local-xxx: "Document Name"
60 pages. Building priority queue...

Priority queue:
- Page 4 (score: 28) - Balance sheet, financial data
- Page 13 (score: 25) - Subsidiary table
```

**Turn 2 - Analyze & Request Approval:**
```
<state>
type: "analyzing"
workspace_id: "local-xxx"
current_page: 4
total_pages: 60
message: "Analyzing page 4/60"
</state>

[Reads extractions, prepares analysis...]

<state>
type: "awaiting_approval"
workspace_id: "local-xxx"
current_page: 4
total_pages: 60
message: "Page 4 analysis complete. Awaiting user approval."
</state>

[Calls mcp.request_verify_approval() - BLOCKS here]
```

**Turn 3 - User Approved via UI:**
```
User clicked: "Verify"

✓ Page 4 marked as verified
Moving to Page 13...

<state>
type: "analyzing"
workspace_id: "local-xxx"
current_page: 13
total_pages: 60
message: "Analyzing page 13/60 (1 verified, 59 pending)"
</state>
```

## Issue Detection Triggers

Flag pages when:
- Table has merged cells or irregular structure
- Low OCR confidence on text
- Handwriting detected
- Image-heavy with poor text extraction
- Multi-column layout ambiguity
- Currency/number formatting unclear
- Missing expected content (gap detection)

## Page Skip Classifications

Mark as `skipped` with classification:
- `cover` - Title/cover page
- `blank` - Intentionally blank
- `toc` - Table of contents
- `index` - Index page
- `decorative` - Decorative/separator
