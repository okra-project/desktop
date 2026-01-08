# Emoji Cleanup Tracking

Ensuring okrapdf-desktop only uses emojis that exist in okrapdf.

## Status: COMPLETED

Build verified: `npm run build` passes

## Changes Made

| Emoji | Description | Files | Replacement |
|-------|-------------|-------|-------------|
| 🥬 | Kale | App.tsx, AuthScreen.tsx, ClaudeSetupScreen.tsx | 📄 (document) |
| 💬 | Speech bubble | DocumentViewer.tsx, EntityActionPopover.tsx | 💡 (idea/tip) |
| 🔄 | Refresh | TodoListDisplay.tsx | 🔍 (search/processing) |
| 💭 | Thought bubble | ThinkingDisplay.tsx | 🧐 (thinking) |
| 💰 | Money bag | ClaudeSetupScreen.tsx | 📈 (growth/value) |
| 🔒 | Lock | AuthScreen.tsx | 🔐 (secure) |
| 💳 | Credit card | AuthScreen.tsx | ✅ (verified) |
| 📖 | Book | toolMetadata.ts | 📄 (document) |
| 🔎 | Magnifying right | toolMetadata.ts | 🔍 (search) |
| ✍️ | Writing hand | toolMetadata.ts | ✎ (edit) |
| ✏️ | Pencil | toolMetadata.ts | ✎ (edit) |
| 📓 | Notebook | toolMetadata.ts | 📝 (note) |
| 🛑 | Stop sign | toolMetadata.ts | ❌ (error) |
| 📚 | Books | toolMetadata.ts | 📋 (list/docs) |
| ⚑ | Flag | TreeNodes.tsx, TableVerificationPanel.tsx | 🔴 (alert) |
| 📜 | Scroll | TableVerificationPanel.tsx | 📋 (list) |
| 👁 | Eye | ReviewTab.tsx | 👀 (look/view) |

## Files Modified

- [x] App.tsx - 🥬 x2 -> 📄
- [x] AuthScreen.tsx - 🥬->📄, 🔒->🔐, 💳->✅
- [x] ClaudeSetupScreen.tsx - 🥬->📄, 💰->📈
- [x] DocumentViewer.tsx - 💬->💡
- [x] ThinkingDisplay.tsx - 💭->🧐
- [x] TodoListDisplay.tsx - 🔄->🔍
- [x] toolMetadata.ts - 📖->📄, 🔎->🔍, ✍️->✎, ✏️->✎, 📓->📝, 🛑->❌, 📚->📋
- [x] EntityActionPopover.tsx - 💬 x4 -> 💡
- [x] TableVerificationPanel.tsx - ⚑ x2->🔴, 📜->📋
- [x] TreeNodes.tsx - ⚑->🔴
- [x] ReviewTab.tsx - 👁->👀

## Verification

Last verified: 2026-01-07

```bash
# Check for disallowed emojis (should return nothing)
cd ~/dev/okrapdf-desktop/src
rg '[🥬💬🔄💭💰🔒💳📖🔎✍✏📓🛑📚⚑📜👁]'

# Verify all emojis exist in okrapdf
for e in 🌐 🎯 👀 💡 💾 📁 📂 📄 📈 📊 📋 📝 🔍 🔐 🔗 🔧 🔴 🕐 🤖 🧐 ☐ ☑ ⚙ ⚠ ⚡ ✅ ✎ ✓ ✕ ✗ ❌ ❓; do
  rg -q "$e" ~/dev/okrapdf && echo "$e ✓" || echo "$e ✗"
done

# Build
npm run build
```
