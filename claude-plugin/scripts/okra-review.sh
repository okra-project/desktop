#!/bin/bash

# OkraPDF Review CLI - update page verification status
# Writes to progress file and audit trail

set -euo pipefail

WORKSPACE_ID="${1:-}"
PAGE="${2:-}"
TRANSITION="${3:-}"
REASON="${4:-}"

if [[ -z "$WORKSPACE_ID" ]] || [[ -z "$PAGE" ]] || [[ -z "$TRANSITION" ]]; then
  cat << 'EOF'
OkraPDF Review - Update page verification status

USAGE:
  okra-review <workspace_id> <page> <transition> [reason]

TRANSITIONS:
  verify              Mark page as verified (pending -> verified)
  flag                Flag for human review (pending -> flagged)
  skip                Skip page (pending -> skipped)
  resolve             Resolve flagged item (flagged -> verified)
  reset               Reset to pending (any -> pending)
  request_reextraction  Request re-extraction (any -> needs_reextraction)

EXAMPLES:
  okra-review local-xxx 5 verify "Auto-verified: confidence 0.96"
  okra-review local-xxx 13 flag "Complex table with merged cells"
  okra-review local-xxx 1 skip "Cover page"
  okra-review local-xxx 13 resolve "User approved after review"

PROGRESS FILE:
  ~/.okrapdf/verify-progress/<workspace_id>.json

NOTE: For MCP integration, use mcp.update_review in codemode.
EOF
  exit 0
fi

PROGRESS_FILE="$HOME/.okrapdf/verify-progress/${WORKSPACE_ID}.json"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Initialize progress file if needed
if [[ ! -f "$PROGRESS_FILE" ]]; then
  mkdir -p "$(dirname "$PROGRESS_FILE")"
  cat > "$PROGRESS_FILE" << EOF
{
  "workspace_id": "$WORKSPACE_ID",
  "started_at": "$TIMESTAMP",
  "updated_at": "$TIMESTAMP",
  "total_pages": 0,
  "pages": {},
  "history": []
}
EOF
fi

# Map transition to status
case "$TRANSITION" in
  verify|resolve)
    STATUS="verified"
    ;;
  flag)
    STATUS="flagged"
    ;;
  skip)
    STATUS="skipped"
    ;;
  reset)
    STATUS="pending"
    ;;
  request_reextraction)
    STATUS="needs_reextraction"
    ;;
  *)
    echo "❌ Unknown transition: $TRANSITION" >&2
    exit 1
    ;;
esac

# Get current status
CURRENT_STATUS=$(jq -r ".pages[\"$PAGE\"].status // \"pending\"" "$PROGRESS_FILE")

# Update progress file
jq --arg page "$PAGE" \
   --arg status "$STATUS" \
   --arg reason "$REASON" \
   --arg ts "$TIMESTAMP" \
   --arg prev "$CURRENT_STATUS" \
   --arg trans "$TRANSITION" \
   '
   .pages[$page] = {
     status: $status,
     reason: $reason,
     updated_at: $ts
   } |
   .history += [{
     page: ($page | tonumber),
     from: $prev,
     to: $status,
     transition: $trans,
     reason: $reason,
     timestamp: $ts
   }] |
   .updated_at = $ts |
   .summary = {
     verified: [.pages | to_entries[] | select(.value.status == "verified")] | length,
     flagged: [.pages | to_entries[] | select(.value.status == "flagged")] | length,
     skipped: [.pages | to_entries[] | select(.value.status == "skipped")] | length,
     pending: [.pages | to_entries[] | select(.value.status == "pending")] | length,
     needs_reextraction: [.pages | to_entries[] | select(.value.status == "needs_reextraction")] | length
   }
   ' "$PROGRESS_FILE" > "${PROGRESS_FILE}.tmp"

mv "${PROGRESS_FILE}.tmp" "$PROGRESS_FILE"

echo "✓ Page $PAGE: $CURRENT_STATUS -> $STATUS"
echo "  Reason: ${REASON:-none}"

# Show summary
SUMMARY=$(jq -r '.summary | "  Summary: \(.verified) verified, \(.flagged) flagged, \(.skipped) skipped, \(.pending) pending"' "$PROGRESS_FILE")
echo "$SUMMARY"
