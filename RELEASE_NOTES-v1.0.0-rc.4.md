# okraPDF Desktop v1.0.0-rc.4

This release candidate gives the local PDF reader a document-first workspace.
The source PDF stays visually central while local files, run history, and
extraction controls remain close at hand without becoming permanent wide
columns.

## Goal

Make opening, reading, and extracting from a PDF feel like one focused macOS
workspace. Keep the PDFKit reader mounted and prominent while letting people
show or tuck away local context and extraction controls independently.

## What changed since RC.3

- The PDF reader is now the permanent center of the window instead of one
  column inside a three-column navigation split.
- Compact left and right rails keep the core workspace and extraction actions
  available while using substantially less horizontal space.
- The local-file and recent-run workspace opens as a collapsible left panel.
  The Extract inspector opens as an independently collapsible right panel and
  starts tucked away.
- The native window toolbar now carries the canonical mark, document name,
  panel toggles, **Open PDF…**, source-reveal, and extraction-box controls.
- Hiding either panel keeps its SwiftUI content mounted, preserving the current
  local selection and extraction state.
- Panel transitions respect Reduce Motion, and rail and toolbar controls expose
  labels, help text, selected state, and current box visibility to assistive
  technologies.
- Hidden drawer controls leave the keyboard and accessibility order, and focus
  returns to the matching persistent rail when a drawer closes.
- Open commands now track active local setup/parsing state directly, with a
  central guard that prevents a replacement PDF from displacing an active run.
  Every open entry point disables during that work, and a native window alert
  reports invalid, missing, or blocked files even when Extract is hidden.
- New runs now use the `Okra` application-support namespace, and the source is
  now available under the MIT License.

## Promoted interfaces

- A familiar document-first PDF-reader hierarchy: local context on the left,
  an uninterrupted source document in the center, and extraction on demand at
  the right.
- Compact, always-available rails for opening a PDF, reopening local work,
  showing Extract, revealing the source, and controlling extraction boxes.
- A cleaner default launch state with Workspace visible for orientation and
  Extract hidden until it is needed.

## Hidden or de-emphasized

- Extraction setup, progress, and output remain available in the Extract
  panel, but no longer reserve a permanent wide column while reading.
- Recent runs remain device-local context, not a cloud document library.
- Accounts, sign-in, subscriptions, promotions, chat, AI-assistant upsells,
  remote control, and cloud upload remain outside this desktop release train.

## Breaking changes / migration

The default run folder changed from
`~/Library/Application Support/okraPDF/Runs/` to
`~/Library/Application Support/Okra/Runs/`. RC.4 does not move or index RC.3
run artifacts automatically: they remain in the former folder on disk but do
not appear in RC.4 Recent runs. Source PDFs are never moved. Provider selection,
explicit Parse behavior, output formats, and the macOS 13 minimum are unchanged.

## Install and validate

1. Download `Okra-1.0.0-rc.4.dmg` and its adjacent `.sha256` file from the
   [`desktop-v1.0.0-rc.4` GitHub prerelease](https://github.com/okra-project/desktop/releases/tag/desktop-v1.0.0-rc.4).
2. Run `shasum -a 256 -c Okra-1.0.0-rc.4.dmg.sha256`, open the DMG, and copy
   **Okra** to **Applications**.
3. Launch with no document open. Confirm Workspace is visible, Extract is
   tucked away, and the center reader remains the largest surface.
4. Open or drop a PDF and confirm that opening it does not start extraction.
5. Show and hide Workspace and Extract from both the toolbar and edge rails;
   confirm the PDF remains visible and the two panels toggle independently.
6. Parse with Apple Vision, reopen Extract, and confirm progress and output are
   preserved. When source boxes are available, exercise their toolbar and rail
   controls in both light and dark appearances.

## Validation

- Layout-state unit coverage verifies the document-first default, independent
  wide toggles, compact mutual exclusion, preference restoration, exact
  breakpoint behavior, and reader-only compact state.
- A regression test verifies that an active local operation cannot be displaced
  by opening another PDF.
- On 2026-08-05, the candidate tree passed the brand-surface gate, all 12 Python
  tests, all 101 Swift tests across 20 suites, and `swift build -c release`.
- A locally packaged, ad-hoc-signed RC.4 app passed empty and loaded-document
  inspection in light and dark appearances. At a 960-point window, Workspace
  and Extract handed off cleanly while the PDF reader remained mounted.
- Both packaging smoke tests passed against the rebuilt local candidate:
  resource-isolated app startup and quarantined-DMG launch through
  LaunchServices.
- The exact tagged artifact must still pass Developer ID signing, hardened
  runtime, notarization, stapling, Gatekeeper, DMG verification, quarantined
  LaunchServices launch, checksum, and signed-appcast automation.
- Manual release approval requires the layout checks above plus the retained
  offline Apple Vision, invalid-input, source-box, clean-install, and signed
  in-place update regressions in `RELEASE_CHECKLIST.md`.

## Rollout

Merge the tested implementation to `main`, then create the immutable annotated
tag `desktop-v1.0.0-rc.4`. Keep the GitHub release marked as a prerelease and
merge the generated signed-appcast branch only after its required
`macos-checks` gate passes.

## Rollback

Keep RC.3 available as the last published candidate. If RC.4 regresses, direct
testers to the RC.3 DMG, avoid moving or reusing the RC.4 tag, and fix forward
under a new release-candidate version. RC.3 and RC.4 retain their run histories
in their respective application-support folders.

## Owner

okraPDF desktop maintainers (`D.6.3`, `Stable #15`,
`okra-project/desktop`).
