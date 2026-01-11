# Reference Features from PDF App Research

Research on high-quality PDF readers to identify highest ROI features for okrapdf-desktop.

## Sources Analyzed

- **Stirling-PDF** (github.com/Stirling-Tools/Stirling-PDF) - Web-based PDF toolkit with plugin architecture
- **Sioyek** (github.com/ahrm/sioyek) - Keyboard-driven PDF reader for power users
- **Skim** (github.com/JackieXie168/skim) - macOS PDF reader for academics

---

## Current State of okrapdf-desktop

- **Stack**: Electron + React 19 + Redux Toolkit + Tailwind
- **Core Features**: PDF viewing (pdfjs-dist), OCR extraction, table extraction (OpenRouter/Qwen), Claude chat
- **Architecture**: Local-first BYOK, workspace-based file storage (~/.okrapdf/workspaces/)
- **Plugin System**: Already has `@okrapdf/review-plugins` with pluginHost pattern (enable/disable/run)

---

## Highest ROI Features to Adopt

| Priority | Feature                                | Source       | Why High ROI                                                                                          | Complexity |
| -------- | -------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------- | ---------- |
| **1**    | **Keyboard-driven navigation**         | Sioyek       | Power users demand it; differentiator from web apps. Single/double-key commands (`gg`, `n`, `N`, `/`) | Low        |
| **2**    | **Smart Jump / Portals**               | Sioyek       | Jump to figures/references without embedded links; huge for academic PDFs                             | Medium     |
| **3**    | **Visual Marks**                       | Sioyek       | Right-click to mark position; reduces disorientation while scrolling                                  | Low        |
| **4**    | **Multi-tool workflow chaining**       | Stirling-PDF | Chain operations without re-uploading; fits your existing plugin arch                                 | Medium     |
| **5**    | **IndexedDB persistence + versioning** | Stirling-PDF | Undo/redo with parent references; already doing workspace-based but could add versioning              | Medium     |
| **6**    | **Annotation sync**                    | Skim         | Sync highlights/notes to external apps (Obsidian, Notion)                                             | Medium     |
| **7**    | **SyncTeX for LaTeX**                  | Sioyek       | Click PDF -> open LaTeX source; niche but beloved by academics                                        | Low        |

---

## Quick Wins (<1 day each)

### 1. Keyboard Shortcuts

- `/` to search
- `n`/`N` for next/prev match
- `gg` go to page 1
- `G` go to last page
- `j`/`k` scroll down/up
- `h`/`l` prev/next page
- `zz` center current position

### 2. Visual Mark

- Right-click to drop a temporary marker line
- Helps maintain position during scrolling
- Can move with `j`/`k` when visual scroll mode enabled

### 3. Command Palette

- `:` to show all available actions
- Searchable list of commands with keybindings
- Already have plugin list - expose it here

---

## Medium Effort (1-3 days)

### 4. Smart Jump

Parse figure/table references (e.g., "Figure 3", "Table 2.1") and create jump targets even without embedded PDF links.

**Implementation hints from Sioyek:**

- `smart_jump_under_pos` function determines target based on cursor position
- Can also search bibliography items in external engines (Google Scholar, Library Genesis)
- Middle-click or shift-middle-click on reference names

### 5. Workflow Chaining

Your plugin system is ready. Expose a "pipeline builder" UI:

- Visual node-based editor like n8n
- Chain: Load PDF -> OCR -> Extract Tables -> Export
- Save/share workflow configs as JSON

### 6. Version History

Track file operations with parent references:

- Each operation creates new version with parent reference
- Enables undo/redo across sessions
- Similar to Stirling-PDF's `StirlingFile` with parent tracking

---

## Architecture Patterns from Stirling-PDF

### Plugin Registration

Their pattern (for reference):

```typescript
createPluginRegistration([
  LoaderPluginPackage,
  ViewportPluginPackage,
  SearchPluginPackage,
  AnnotationPluginPackage,
  HistoryPluginPackage,
  ZoomPluginPackage,
  ThumbnailPluginPackage,
  // ...
]);
```

Your `pluginHost.subscribe()` / `pluginHost.run()` pattern is equivalent.

### Recommendations

- Add a **visual plugin registry UI** (toggle plugins on/off)
- **Shareable workflow configs** (JSON export/import like n8n)
- **Memory management** - Explicit cleanup of PDF.js documents, Blob URLs, Web Workers

### File Management

Stirling-PDF uses:

- `StirlingFile` objects (complete file data)
- `StirlingFileStub` objects (lightweight metadata)
- IndexedDB persistence with automatic thumbnail generation

---

## Sioyek Key Features Deep Dive

### Portals

- Link two locations, potentially across different documents
- "Helper window" displays closest portal destination
- Auto-updates as user navigates
- Create with `p` at source, then `p` at destination

### Marks and Bookmarks

- **Marks**: Single-character named (`m` + char), jump back with backtick + char
- **Bookmarks**: Named by text string, global across documents
- Add with `b`, navigate with `gb` (current doc) or `gB` (all docs)

### Highlights

- Different "types" with configurable colors (`hh` for type 'h')
- Searchable within current document (`gh`) or globally (`gH`)

### External Search

- Selected text can be searched using predefined engines
- Configure in prefs (Google Scholar, Library Genesis, etc.)
- `s` command triggers external search

---

## Implementation Priority

**Start with keyboard shortcuts** - single highest-impact, lowest-effort improvement that makes power users love the app. Sioyek's success is largely built on this foundation.

Then progress through:

1. Visual marks
2. Command palette
3. Smart jump
4. Workflow chaining UI
5. Version history
