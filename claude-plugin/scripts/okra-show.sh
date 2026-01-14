#!/bin/bash

# OkraPDF Show CLI - navigate user to specific page/element
# Wrapper for mcp.show_result

set -euo pipefail

WORKSPACE_ID="${1:-}"
PAGE="${2:-}"
LABEL="${3:-Review needed}"

if [[ -z "$WORKSPACE_ID" ]]; then
  cat << 'EOF'
OkraPDF Show - Navigate user to page/element

USAGE:
  okra-show <workspace_id> <page> [label]

EXAMPLES:
  okra-show local-xxx 5 "Table needs review"
  okra-show local-xxx 13 "Complex layout detected"

NOTE: For best results, use mcp.show_result in codemode:

  await mcp.show_result({
    workspaceId: 'local-xxx',
    selector: '.table:page(5)',
    label: 'Table needs verification'
  });
EOF
  exit 0
fi

echo "Use mcp.show_result({ workspaceId: '$WORKSPACE_ID', selector: ':page($PAGE)', label: '$LABEL' }) in codemode"
