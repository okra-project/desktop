#!/bin/bash

# OkraPDF Priority Queue - surface high-value pages first
# Queries workspace to find pages needing attention

set -euo pipefail

WORKSPACE_ID="${1:-}"
MODE="${2:-all}"

if [[ -z "$WORKSPACE_ID" ]]; then
  cat << 'EOF'
OkraPDF Priority - Surface high-stakes pages first

USAGE:
  okra-priority <workspace_id> [mode]

MODES:
  all         List all high-priority pages (default)
  tables      Pages with tables (complex extraction)
  figures     Pages with figures/images
  financial   Pages with numbers/currency
  low-conf    Pages with low confidence scores
  gaps        Pages with missing content

EXAMPLES:
  okra-priority local-xxx tables
  okra-priority local-xxx financial
  okra-priority local-xxx low-conf

OUTPUT:
  JSON list of pages sorted by priority (highest first)

PRIORITY SCORING:
  +10  Has tables
  +5   Has figures
  +8   Has financial data (currency, numbers)
  +15  Low confidence (< 0.80)
  +20  Very low confidence (< 0.60)
  +12  Has merged cells
  +7   Multi-column layout

NOTE: Use mcp.codemode for complex queries:

  // Get all tables, sorted by page
  const tables = await mcp.query_selector({
    workspaceId: 'local-xxx',
    selector: '.table'
  });

  // Get pages with low confidence
  const lowConf = await mcp.query({
    query: 'SELECT page, confidence FROM entities WHERE confidence < 0.8'
  });
EOF
  exit 0
fi

# Priority query patterns for codemode
case "$MODE" in
  tables)
    echo "Query: mcp.query_selector({ workspaceId: '$WORKSPACE_ID', selector: '.table' })"
    echo ""
    echo "Returns pages with tables - highest priority for verification."
    ;;
  figures)
    echo "Query: mcp.query_selector({ workspaceId: '$WORKSPACE_ID', selector: '.figure' })"
    echo ""
    echo "Returns pages with figures/images."
    ;;
  financial)
    echo "Query: mcp.search_workspace({ workspaceId: '$WORKSPACE_ID', query: '\$|USD|EUR|¥|revenue|total' })"
    echo ""
    echo "Returns pages with financial data."
    ;;
  low-conf)
    echo "Query: mcp.query({ query: 'SELECT DISTINCT page FROM entities WHERE confidence < 0.8 ORDER BY confidence ASC' })"
    echo ""
    echo "Returns pages with low confidence extractions."
    ;;
  gaps)
    echo "Query: mcp.query({ query: 'SELECT page FROM pages WHERE entity_count = 0' })"
    echo ""
    echo "Returns pages with no extracted content (potential gaps)."
    ;;
  all|*)
    cat << EOF
Priority Queue for $WORKSPACE_ID:

Use mcp.codemode to build priority queue:

const priority = [];

// 1. Get all tables (high priority)
const tables = await mcp.query_selector({ workspaceId: '$WORKSPACE_ID', selector: '.table' });
tables.results?.forEach(t => {
  priority.push({ page: t.page, reason: 'has_table', score: 10 });
});

// 2. Search for financial content
const financial = await mcp.search_workspace({ workspaceId: '$WORKSPACE_ID', query: 'total|revenue|amount' });
financial.results?.forEach(f => {
  const existing = priority.find(p => p.page === f.page);
  if (existing) existing.score += 8;
  else priority.push({ page: f.page, reason: 'financial_data', score: 8 });
});

// 3. Sort by score descending
priority.sort((a, b) => b.score - a.score);

return { priorityQueue: priority.slice(0, 20) };
EOF
    ;;
esac
