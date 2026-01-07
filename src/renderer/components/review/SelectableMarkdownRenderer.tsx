/**
 * SelectableMarkdownRenderer
 *
 * Renders markdown content with selectable table cells.
 * Allows users to select table data and send it to the review agent.
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface SelectionData {
  cells: Array<{ row: number; col: number; value: string; isHeader: boolean }>;
  headers: string[];
  asText: string;
  asMarkdown: string;
}

export interface SelectableMarkdownRendererProps {
  content: string;
  onSelectionChange?: (selection: SelectionData | null) => void;
  onChatWithSelection?: (selection: SelectionData) => void;
  className?: string;
}

interface TableData {
  headers: string[];
  rows: string[][];
}

interface CellCoord {
  row: number;
  col: number;
}

// ============================================================================
// Markdown Parser
// ============================================================================

function parseMarkdownTables(content: string): { tables: TableData[]; otherContent: string[] } {
  const lines = content.split('\n');
  const tables: TableData[] = [];
  const otherContent: string[] = [];
  let currentTable: TableData | null = null;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if line is a table row
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());

      // Skip separator rows (---|---|---)
      if (cells.every((c) => /^[-:]+$/.test(c))) {
        continue;
      }

      if (!inTable) {
        // Start new table
        currentTable = { headers: cells, rows: [] };
        inTable = true;
      } else if (currentTable) {
        // Add row to current table
        currentTable.rows.push(cells);
      }
    } else {
      // End of table or non-table content
      if (inTable && currentTable) {
        tables.push(currentTable);
        currentTable = null;
        inTable = false;
      }
      if (line) {
        otherContent.push(lines[i]);
      }
    }
  }

  // Handle table at end of content
  if (inTable && currentTable) {
    tables.push(currentTable);
  }

  return { tables, otherContent };
}

// ============================================================================
// Selection Helpers
// ============================================================================

function normalizeSelection(
  start: CellCoord,
  end: CellCoord
): { startRow: number; endRow: number; startCol: number; endCol: number } {
  return {
    startRow: Math.min(start.row, end.row),
    endRow: Math.max(start.row, end.row),
    startCol: Math.min(start.col, end.col),
    endCol: Math.max(start.col, end.col),
  };
}

function buildSelectionData(
  table: TableData,
  start: CellCoord,
  end: CellCoord
): SelectionData {
  const { startRow, endRow, startCol, endCol } = normalizeSelection(start, end);
  const cells: SelectionData['cells'] = [];
  const selectedHeaders = table.headers.slice(startCol, endCol + 1);

  // Collect selected cells
  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const isHeader = row === -1;
      const value = isHeader
        ? table.headers[col]
        : table.rows[row]?.[col] ?? '';
      cells.push({ row, col, value, isHeader });
    }
  }

  // Build text representation (tab-separated)
  const textRows: string[] = [];
  if (startRow === -1) {
    textRows.push(selectedHeaders.join('\t'));
  }
  for (let row = Math.max(0, startRow); row <= Math.min(endRow, table.rows.length - 1); row++) {
    const rowCells = [];
    for (let col = startCol; col <= endCol; col++) {
      rowCells.push(table.rows[row]?.[col] ?? '');
    }
    textRows.push(rowCells.join('\t'));
  }

  // Build markdown representation
  const markdownRows: string[] = [];
  markdownRows.push('| ' + selectedHeaders.join(' | ') + ' |');
  markdownRows.push('| ' + selectedHeaders.map(() => '---').join(' | ') + ' |');
  for (let row = Math.max(0, startRow); row <= Math.min(endRow, table.rows.length - 1); row++) {
    const rowCells = [];
    for (let col = startCol; col <= endCol; col++) {
      rowCells.push(table.rows[row]?.[col] ?? '');
    }
    markdownRows.push('| ' + rowCells.join(' | ') + ' |');
  }

  return {
    cells,
    headers: selectedHeaders,
    asText: textRows.join('\n'),
    asMarkdown: markdownRows.join('\n'),
  };
}

// ============================================================================
// SelectableTable Component
// ============================================================================

interface SelectableTableProps {
  table: TableData;
  tableIndex: number;
  onSelectionChange?: (selection: SelectionData | null) => void;
  onChatWithSelection?: (selection: SelectionData) => void;
}

function SelectableTable({
  table,
  tableIndex,
  onSelectionChange,
  onChatWithSelection,
}: SelectableTableProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<CellCoord | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<CellCoord | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  const handleMouseDown = useCallback(
    (row: number, col: number, e: React.MouseEvent) => {
      e.preventDefault();
      setIsSelecting(true);
      setSelectionStart({ row, col });
      setSelectionEnd({ row, col });
      setShowMenu(false);
    },
    []
  );

  const handleMouseMove = useCallback(
    (row: number, col: number) => {
      if (isSelecting) {
        setSelectionEnd({ row, col });
      }
    },
    [isSelecting]
  );

  const handleMouseUp = useCallback(() => {
    if (isSelecting && selectionStart && selectionEnd) {
      setIsSelecting(false);
      const selection = buildSelectionData(table, selectionStart, selectionEnd);
      onSelectionChange?.(selection);
      setShowMenu(true);
    }
  }, [isSelecting, selectionStart, selectionEnd, table, onSelectionChange]);

  const isCellSelected = useCallback(
    (row: number, col: number): boolean => {
      if (!selectionStart || !selectionEnd) return false;
      const { startRow, endRow, startCol, endCol } = normalizeSelection(
        selectionStart,
        selectionEnd
      );
      return row >= startRow && row <= endRow && col >= startCol && col <= endCol;
    },
    [selectionStart, selectionEnd]
  );

  const handleCopy = useCallback(() => {
    if (selectionStart && selectionEnd) {
      const selection = buildSelectionData(table, selectionStart, selectionEnd);
      navigator.clipboard.writeText(selection.asText);
      setShowMenu(false);
    }
  }, [table, selectionStart, selectionEnd]);

  const handleChat = useCallback(() => {
    if (selectionStart && selectionEnd) {
      const selection = buildSelectionData(table, selectionStart, selectionEnd);
      onChatWithSelection?.(selection);
      setShowMenu(false);
    }
  }, [table, selectionStart, selectionEnd, onChatWithSelection]);

  const handleClearSelection = useCallback(() => {
    setSelectionStart(null);
    setSelectionEnd(null);
    setShowMenu(false);
    onSelectionChange?.(null);
  }, [onSelectionChange]);

  return (
    <div style={styles.tableWrapper}>
      <table
        ref={tableRef}
        style={styles.table}
        onMouseLeave={() => isSelecting && handleMouseUp()}
      >
        <thead>
          <tr>
            {table.headers.map((header, col) => (
              <th
                key={`${tableIndex}-h-${col}`}
                style={{
                  ...styles.th,
                  ...(isCellSelected(-1, col) ? styles.selectedCell : {}),
                }}
                onMouseDown={(e) => handleMouseDown(-1, col, e)}
                onMouseMove={() => handleMouseMove(-1, col)}
                onMouseUp={handleMouseUp}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIdx) => (
            <tr key={`${tableIndex}-r-${rowIdx}`}>
              {row.map((cell, col) => (
                <td
                  key={`${tableIndex}-${rowIdx}-${col}`}
                  style={{
                    ...styles.td,
                    ...(isCellSelected(rowIdx, col) ? styles.selectedCell : {}),
                  }}
                  onMouseDown={(e) => handleMouseDown(rowIdx, col, e)}
                  onMouseMove={() => handleMouseMove(rowIdx, col)}
                  onMouseUp={handleMouseUp}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Selection Action Menu */}
      {showMenu && selectionStart && selectionEnd && (
        <div style={styles.actionMenu}>
          <button onClick={handleCopy} style={styles.actionButton}>
            Copy
          </button>
          {onChatWithSelection && (
            <button onClick={handleChat} style={styles.actionButtonPrimary}>
              Chat
            </button>
          )}
          <button onClick={handleClearSelection} style={styles.actionButtonMuted}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SelectableMarkdownRenderer({
  content,
  onSelectionChange,
  onChatWithSelection,
  className,
}: SelectableMarkdownRendererProps) {
  const { tables, otherContent } = useMemo(
    () => parseMarkdownTables(content),
    [content]
  );

  return (
    <div className={className} style={styles.container}>
      {/* Render non-table content */}
      {otherContent.length > 0 && (
        <div style={styles.textContent}>
          {otherContent.map((line, idx) => {
            // Headers
            if (line.startsWith('# ')) {
              return <h1 key={idx} style={styles.h1}>{line.slice(2)}</h1>;
            }
            if (line.startsWith('## ')) {
              return <h2 key={idx} style={styles.h2}>{line.slice(3)}</h2>;
            }
            if (line.startsWith('### ')) {
              return <h3 key={idx} style={styles.h3}>{line.slice(4)}</h3>;
            }
            // Paragraph
            return <p key={idx} style={styles.p}>{line}</p>;
          })}
        </div>
      )}

      {/* Render tables with selection */}
      {tables.map((table, idx) => (
        <SelectableTable
          key={`table-${idx}`}
          table={table}
          tableIndex={idx}
          onSelectionChange={onSelectionChange}
          onChatWithSelection={onChatWithSelection}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontSize: '14px',
    lineHeight: 1.6,
  },
  textContent: {
    marginBottom: '16px',
  },
  h1: {
    fontSize: '20px',
    fontWeight: 'bold',
    margin: '16px 0 8px',
  },
  h2: {
    fontSize: '18px',
    fontWeight: 'bold',
    margin: '14px 0 6px',
  },
  h3: {
    fontSize: '16px',
    fontWeight: 'bold',
    margin: '12px 0 4px',
  },
  p: {
    margin: '8px 0',
  },
  tableWrapper: {
    position: 'relative',
    marginBottom: '16px',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
    userSelect: 'none',
  },
  th: {
    padding: '8px 12px',
    backgroundColor: '#f1f5f9',
    borderBottom: '2px solid #e2e8f0',
    fontWeight: 600,
    textAlign: 'left',
    cursor: 'cell',
  },
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid #e2e8f0',
    cursor: 'cell',
  },
  selectedCell: {
    backgroundColor: '#dbeafe',
    outline: '1px solid #3b82f6',
  },
  actionMenu: {
    display: 'flex',
    gap: '4px',
    padding: '8px',
    backgroundColor: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
    marginTop: '8px',
    width: 'fit-content',
  },
  actionButton: {
    padding: '6px 12px',
    borderRadius: '4px',
    border: '1px solid #e2e8f0',
    backgroundColor: '#fff',
    color: '#334155',
    fontSize: '12px',
    cursor: 'pointer',
  },
  actionButtonPrimary: {
    padding: '6px 12px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#3b82f6',
    color: '#fff',
    fontSize: '12px',
    cursor: 'pointer',
  },
  actionButtonMuted: {
    padding: '6px 12px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    fontSize: '12px',
    cursor: 'pointer',
  },
};

export default SelectableMarkdownRenderer;
