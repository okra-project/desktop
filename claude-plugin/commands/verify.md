---
description: "Start PDF verification loop - won't stop until all pages done"
argument-hint: "DOCUMENT [--max-iterations N]"
allowed-tools: ["Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*:*)", "Read", "Write", "mcp__okrapdf-desktop__codemode"]
hide-from-slash-command-tool: "true"
---

# OkraPDF Verification Command

Execute setup script to initialize verification loop:

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/setup-verify.sh" $ARGUMENTS
```

You are now in a verification loop that **WILL NOT STOP** until all pages are verified.

## Your Mission

1. **Find the document** using mcp.global_search or mcp.list_workspaces
2. **Build priority queue** - query tables, figures, financial data FIRST
3. **For EACH page**: use `mcp.request_verify_approval()` - THIS BLOCKS until user clicks Verify/Flag/Skip/Re-extract
4. **Update progress** file ONLY after user approval
5. **Continue until 100% done**

## CRITICAL: Human-in-the-Loop Verification

**NEVER auto-verify pages. ALWAYS use `request_verify_approval` and wait for user.**

```javascript
// For EACH page in priority queue:
const { response } = await mcp.request_verify_approval({
  workspaceId,
  pageNumber,
  analysis: {
    contentType: 'Balance Sheet',  // Detected content type
    confidence: 0.92,              // Your confidence score
    findings: ['Key data extracted correctly', 'Figures match'],
    issues: ['OCR artifacts detected']  // Optional issues
  },
  extractions: {
    docai: docaiMarkdown,    // From plugins/google-docai/page-XXX.md
    openrouter: visionMd,    // From plugins/openrouter/page-XXX.md
    parse: parseMd           // From parse CLI if used
  }
});

// THIS BLOCKS - desktop app shows side-by-side comparison
// User clicks one of: Verify, Flag, Skip, Re-extract

// Handle response
if (response.action === 'verify') {
  // Update progress file: page -> verified
} else if (response.action === 'flag') {
  // Keep in queue for later
} else if (response.action === 'skip') {
  // Mark as skipped
} else if (response.action === 'reextract') {
  // Trigger re-extraction
}
```

## State Machine

```
<state>
type: "searching" | "analyzing" | "awaiting_approval" | "blocked" | "complete"
workspace_id: string | null
current_page: number | null
total_pages: number | null
priority_queue_size: number | null
message: string
</state>
```

Every page MUST go through: `analyzing` → `awaiting_approval` (blocks) → action taken

## Progress File

Track at `~/.okrapdf/verify-progress/{workspace_id}.json`:

```json
{
  "workspace_id": "local-xxx",
  "pages": {
    "4": { "status": "verified", "action_by": "user", "timestamp": "..." },
    "13": { "status": "flagged", "reason": "complex table" }
  },
  "priority_queue": [4, 13, 57, 62],
  "current_index": 0
}
```

## MCP Tools

```javascript
// List workspaces
const { workspaces } = await mcp.list_workspaces();

// Get tables for priority
const { tables } = await mcp.get_tables({ workspaceId });

// Search content
const { results } = await mcp.search_workspace({ workspaceId, query: 'revenue' });

// Navigate to page
await mcp.show_result({ workspaceId, selector: ':page(4)' });

// Request verification approval (BLOCKING!)
const { response } = await mcp.request_verify_approval({ ... });
```

## Completion Criteria

Output `<completion_promise>VERIFICATION_COMPLETE</completion_promise>` ONLY when:
- Priority queue is empty
- No pages with status "pending" remain
- No pages with status "flagged" remain (all resolved by user)

**DO NOT LIE TO EXIT** - the loop checks actual progress file!
