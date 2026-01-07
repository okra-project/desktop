# PRD: Review Page Parity - okrapdf-desktop

## Overview

Port recent web review page improvements (last 24h) from `okrapdf` to `okrapdf-desktop` to maintain feature parity.

## Source Commits (okrapdf - last 24h)

Key changes to port:
- `37630f4` feat: replace resizable sidebar with fixed 165px collapsible panel
- `038e40a` feat: show doc tree scrollbar only on hover
- `deee805` remove redundant page count from doc tree
- `dbdedd6` Consolidate layers dropdown: fix z-index, add count badge
- `2416083` fix: show content when loaded, skeleton only during fetch in review markdown panel
- `a8a7b31` fix: left-align page entity counts in doc tree panel

## Changes Required

### 1. Collapsible Sidebar (High Priority)
**Web pattern**: Fixed 165px width, collapse to 0px with toggle button
**Current desktop**: Resizable 280px width
**Changes**:
- Replace resizable sidebar with fixed 165px collapsible panel
- Add PanelLeft/PanelLeftClose toggle button on edge
- Use CSS transition (200ms) for smooth collapse

### 2. LayerMenu Dropdown (High Priority)
**Web pattern**: Dropdown with checkbox-style layer toggles + count badge
**Current desktop**: Simple toggle button (show/hide all overlays)
**Changes**:
- Create LayerMenu component with individual layer toggles (table, figure, footnote, ocr)
- Add count badge showing active layer count
- Use entity color coding for checkboxes

### 3. TreeNodes Simplified (Medium Priority)
**Web pattern**: Compact `PageNode` showing: status icon + page number + entity counts inline
**Current desktop**: Verbose with page number + [status label] + verified/total
**Changes**:
- Simplify to: CheckCircle/Circle + pageNum + inline entity icons with counts
- Remove redundant status text labels
- Remove expand/collapse chevrons (web uses flat list)

### 4. Content Loading Skeleton (Medium Priority)
**Web pattern**: Show skeleton during fetch, content when loaded
**Current desktop**: Shows "Loading content..." text
**Changes**:
- Add animated skeleton placeholders during content fetch
- Use `currentData` instead of `data` to prevent stale content flash

### 5. Eye/Code Toggle (Low Priority)
**Web pattern**: Toggle button group with Eye (preview) / Code (edit) icons
**Current desktop**: "Edit" button text
**Changes**:
- Replace Edit button with Eye/Code toggle button group
- Add visual active state (bg-white + shadow)

### 6. Scrollbar on Hover (Low Priority)
**Web pattern**: `scrollbar-on-hover` CSS class hides scrollbar until hover
**Current desktop**: Always visible scrollbar
**Changes**:
- Add CSS for scrollbar-on-hover behavior to tree panel

## Files to Modify

1. `src/renderer/components/review/ReviewTab.tsx` - Main layout changes
2. `src/renderer/components/review/TreeNodes.tsx` - Simplified page node
3. `src/renderer/components/review/FilterChips.tsx` - May simplify
4. `src/renderer/components/review/LayerMenu.tsx` - NEW FILE
5. `src/renderer/styles/review.css` - NEW FILE for scrollbar CSS

## Testing Checklist

- [ ] Sidebar collapses/expands with smooth animation
- [ ] Toggle button appears on sidebar edge
- [ ] LayerMenu shows/hides individual entity types on PDF
- [ ] Active layer count shows in badge
- [ ] TreeNodes show compact format with entity counts
- [ ] Content skeleton shows during page fetch
- [ ] Eye/Code toggle switches preview/edit mode
- [ ] Scrollbar hidden until hover on tree panel

## Out of Scope

- VirtualPdfScroller (desktop uses different PDF viewer)
- ResizeObserver/layoutVersion (not needed without react-resizable-panels)
- Verification toggle (web-specific feature flag)
