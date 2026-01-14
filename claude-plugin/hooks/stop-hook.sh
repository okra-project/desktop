#!/bin/bash

# OkraPDF Verification Stop Hook
# Prevents session exit until all pages are verified
# Similar to ralph-loop but checks page verification progress

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# State file location
VERIFY_STATE_FILE=".claude/okra-verify.local.json"

# Check if verification is active
if [[ ! -f "$VERIFY_STATE_FILE" ]]; then
  # No active verification - allow exit
  exit 0
fi

# Read state
STATE=$(cat "$VERIFY_STATE_FILE")

# Extract values
WORKSPACE_ID=$(echo "$STATE" | jq -r '.workspace_id // empty')
ITERATION=$(echo "$STATE" | jq -r '.iteration // 1')
MAX_ITERATIONS=$(echo "$STATE" | jq -r '.max_iterations // 0')
TOTAL_PAGES=$(echo "$STATE" | jq -r '.total_pages // 0')

if [[ -z "$WORKSPACE_ID" ]]; then
  echo "⚠️  OkraPDF verify: No workspace_id in state file" >&2
  rm "$VERIFY_STATE_FILE"
  exit 0
fi

# Check progress file
PROGRESS_FILE="$HOME/.okrapdf/verify-progress/${WORKSPACE_ID}.json"

if [[ ! -f "$PROGRESS_FILE" ]]; then
  echo "⚠️  OkraPDF verify: Progress file not found, continuing loop" >&2
else
  # Count page statuses
  PENDING=$(jq '[.pages | to_entries[] | select(.value.status == "pending")] | length' "$PROGRESS_FILE" 2>/dev/null || echo "0")
  VERIFIED=$(jq '[.pages | to_entries[] | select(.value.status == "verified")] | length' "$PROGRESS_FILE" 2>/dev/null || echo "0")
  FLAGGED=$(jq '[.pages | to_entries[] | select(.value.status == "flagged")] | length' "$PROGRESS_FILE" 2>/dev/null || echo "0")
  SKIPPED=$(jq '[.pages | to_entries[] | select(.value.status == "skipped")] | length' "$PROGRESS_FILE" 2>/dev/null || echo "0")

  DONE=$((VERIFIED + SKIPPED))

  # Check for completion promise in last output
  TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path')
  if [[ -f "$TRANSCRIPT_PATH" ]]; then
    LAST_OUTPUT=$(grep '"role":"assistant"' "$TRANSCRIPT_PATH" | tail -1 | jq -r '.message.content | map(select(.type == "text")) | map(.text) | join("\n")' 2>/dev/null || echo "")

    if echo "$LAST_OUTPUT" | grep -q "VERIFICATION_COMPLETE"; then
      # Check if actually complete
      if [[ "$PENDING" -eq 0 ]] && [[ "$FLAGGED" -eq 0 ]]; then
        echo "✅ OkraPDF verify: All $TOTAL_PAGES pages verified!"
        echo "   Verified: $VERIFIED | Skipped: $SKIPPED"
        rm "$VERIFY_STATE_FILE"
        exit 0
      else
        echo "⚠️  Completion claimed but pages remaining:" >&2
        echo "   Pending: $PENDING | Flagged: $FLAGGED" >&2
      fi
    fi
  fi

  # All done check (no pending, no flagged)
  if [[ "$PENDING" -eq 0 ]] && [[ "$FLAGGED" -eq 0 ]] && [[ "$DONE" -gt 0 ]]; then
    echo "✅ OkraPDF verify: All pages complete!"
    rm "$VERIFY_STATE_FILE"
    exit 0
  fi
fi

# Check max iterations
if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "🛑 OkraPDF verify: Max iterations ($MAX_ITERATIONS) reached."
  echo "   Progress: $VERIFIED verified, $FLAGGED flagged, $PENDING pending"
  rm "$VERIFY_STATE_FILE"
  exit 0
fi

# Not complete - continue loop
NEXT_ITERATION=$((ITERATION + 1))

# Update iteration in state
jq ".iteration = $NEXT_ITERATION | .updated_at = \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"" "$VERIFY_STATE_FILE" > "${VERIFY_STATE_FILE}.tmp"
mv "${VERIFY_STATE_FILE}.tmp" "$VERIFY_STATE_FILE"

# Build prompt to continue
PROMPT="Continue PDF verification for workspace $WORKSPACE_ID.

Progress: $VERIFIED verified, $FLAGGED flagged, $SKIPPED skipped, $PENDING pending of $TOTAL_PAGES pages.

Next steps:
1. Check progress file: ~/.okrapdf/verify-progress/${WORKSPACE_ID}.json
2. Find next pending page
3. Verify or flag it
4. Update progress
5. Continue until ALL pages done

Output <completion_promise>VERIFICATION_COMPLETE</completion_promise> ONLY when:
- No pending pages remain
- No flagged pages remain (all resolved by user)

DO NOT stop until complete."

SYSTEM_MSG="🔄 OkraPDF verify iteration $NEXT_ITERATION | $VERIFIED/$TOTAL_PAGES verified | $PENDING pending | $FLAGGED flagged"

# Output JSON to block stop and continue
jq -n \
  --arg prompt "$PROMPT" \
  --arg msg "$SYSTEM_MSG" \
  '{
    "decision": "block",
    "reason": $prompt,
    "systemMessage": $msg
  }'

exit 0
