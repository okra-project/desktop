#!/bin/bash

# OkraPDF Query CLI - wrapper for MCP codemode
# Provides CLI access to workspace queries

set -euo pipefail

COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
  list|ls)
    # List all workspaces
    echo '{"action":"list_workspaces"}' | nc -U /tmp/okrapdf-mcp.sock 2>/dev/null || \
    cat << 'EOF'
Usage: okra-query list

Lists all available workspaces. Use mcp.list_workspaces() in codemode instead:

await mcp.list_workspaces()
EOF
    ;;

  search)
    # Global search
    QUERY="$1"
    echo "{\"action\":\"global_search\",\"query\":\"$QUERY\"}" | nc -U /tmp/okrapdf-mcp.sock 2>/dev/null || \
    echo "Use mcp.global_search({ query: '$QUERY' }) in codemode"
    ;;

  get)
    # Get workspace page
    WORKSPACE_ID="$1"
    PAGE="${2:-1}"
    echo "Use mcp.get_workspace({ workspaceId: '$WORKSPACE_ID', page: $PAGE }) in codemode"
    ;;

  tables)
    # Get tables from workspace
    WORKSPACE_ID="$1"
    echo "Use mcp.query_selector({ workspaceId: '$WORKSPACE_ID', selector: '.table' }) in codemode"
    ;;

  help|*)
    cat << 'EOF'
OkraPDF Query CLI

COMMANDS:
  list                    List all workspaces
  search <query>          Global search across workspaces
  get <id> [page]         Get workspace page content
  tables <id>             Get tables from workspace

NOTE: For best results, use mcp.codemode directly:

  // List workspaces
  const { workspaces } = await mcp.list_workspaces();

  // Search
  const { results } = await mcp.global_search({ query: 'TSMC' });

  // Get page
  const { content } = await mcp.get_workspace({ workspaceId: 'local-xxx', page: 1 });

  // Query tables
  const tables = await mcp.query_selector({ workspaceId: 'local-xxx', selector: '.table' });
EOF
    ;;
esac
