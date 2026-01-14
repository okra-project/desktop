#!/bin/bash

# OkraPDF Verification Setup Script
# Initializes verification loop state

set -euo pipefail

WORKSPACE_ID=""
MAX_ITERATIONS=0

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      cat << 'HELP_EOF'
OkraPDF Verify - Page-by-page PDF verification loop

USAGE:
  /okrapdf:verify [DOCUMENT_NAME_OR_ID] [OPTIONS]

ARGUMENTS:
  DOCUMENT_NAME_OR_ID    Workspace ID (local-xxx) or search term

OPTIONS:
  --max-iterations <n>   Max iterations before auto-stop (default: unlimited)
  -h, --help             Show this help

DESCRIPTION:
  Starts a verification loop that won't stop until ALL pages are verified.
  Uses a Stop hook to prevent exit until complete.

  The agent will:
  1. Find the document workspace
  2. Initialize progress tracking
  3. Iterate through each page
  4. Flag items for human review
  5. Continue until 100% verified

EXAMPLES:
  /okrapdf:verify tsmc
  /okrapdf:verify local-bP6_YqSHsCnz --max-iterations 100
  /okrapdf:verify "financial report"

COMPLETION:
  Loop stops when:
  - All pages have status: verified or skipped
  - No pages have status: pending or flagged
  - Agent outputs: VERIFICATION_COMPLETE

MONITORING:
  cat .claude/okra-verify.local.json
  cat ~/.okrapdf/verify-progress/WORKSPACE_ID.json | jq .summary
HELP_EOF
      exit 0
      ;;
    --max-iterations)
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    *)
      WORKSPACE_ID="$1"
      shift
      ;;
  esac
done

if [[ -z "$WORKSPACE_ID" ]]; then
  echo "❌ Error: No document specified" >&2
  echo "" >&2
  echo "Usage: /okrapdf:verify <document-name-or-id>" >&2
  echo "" >&2
  echo "Examples:" >&2
  echo "  /okrapdf:verify tsmc" >&2
  echo "  /okrapdf:verify local-xxx" >&2
  exit 1
fi

# Create state directory
mkdir -p .claude
mkdir -p "$HOME/.okrapdf/verify-progress"

# Create state file
cat > .claude/okra-verify.local.json << EOF
{
  "active": true,
  "workspace_id": "$WORKSPACE_ID",
  "iteration": 1,
  "max_iterations": $MAX_ITERATIONS,
  "total_pages": 0,
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

cat << EOF
🔄 OkraPDF verification loop activated!

Document: $WORKSPACE_ID
Max iterations: $(if [[ $MAX_ITERATIONS -gt 0 ]]; then echo $MAX_ITERATIONS; else echo "unlimited"; fi)

The stop hook is now active. When you try to exit, verification will continue
until ALL pages are verified or skipped.

To monitor:
  cat .claude/okra-verify.local.json
  cat ~/.okrapdf/verify-progress/*.json | jq .summary

⚠️  This loop will NOT stop until complete!
    Use --max-iterations as a safety limit.

Starting verification...
═══════════════════════════════════════════════════════════

1. First, search for the document workspace
2. Get total page count
3. Initialize progress file
4. Begin page-by-page verification

COMPLETION CRITERIA:
- Output <completion_promise>VERIFICATION_COMPLETE</completion_promise>
- ONLY when ALL pages are verified or skipped
- Do NOT lie to exit early

═══════════════════════════════════════════════════════════
EOF
