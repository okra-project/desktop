# okraPDF Desktop v0.5.0-beta.20

This is a selected-tester friends beta for Apple-silicon Macs running macOS 13
or later. It is a prerelease, not the v1.0 stable promise. PDF processing in the
tested path is local-only. Beta.20 replaces beta.19 as the build sent to
friends.

## Goal

Prove that a friend can install okraPDF through the normal macOS path, parse a
PDF with the zero-setup Apple Vision provider, and now see exactly where every
extracted block came from: source-PDF bounding boxes render for both providers,
and hovering an extracted block or a box highlights its counterpart on the
other side.

## What changed since beta.19

- The Docling provider is removed for now. Apple Vision is the automatic
  default, and a previously stored Docling selection silently falls back to
  Apple Vision. Baidu Unlimited-OCR remains fully supported and selectable.
- Apple Vision runs now emit the same structured `result.json` as Baidu runs,
  with normalized per-block bounding boxes: Vision observation boxes for
  scanned pages and PDFKit line-selection boxes for native-text pages.
- Source-PDF bounding boxes are provider-neutral: valid normalized blocks from
  either provider render as screen-only overlays on the source PDF.
- Baidu coordinate parsing now normalizes both 0–1000 layout boxes and
  already-normalized 0–1 boxes, and box geometry is crop- and rotation-aware in
  both directions, so overlays land exactly on the corresponding source text.
- Two-way hover linking: hovering an extracted block card highlights its box on
  the source PDF; hovering a box highlights the matching card and scrolls it
  into view. Existing two-way click selection is unchanged.

## Promoted interfaces

- A five-minute Apple Vision path: open or drop a PDF, click **Parse**, then
  copy the Markdown or use **Save As** to write a `.md` file.
- **Show boxes** with provider-neutral source-PDF bounding boxes, two-way
  hover highlighting, and two-way click selection.
- A Developer ID signed, Apple-notarized DMG with an optional published
  SHA-256 check.
- Sparkle's signed **Check for Updates…** → **Install and Relaunch** flow.
- A privacy-safe feedback path owned directly by the desktop maintainer.

## Hidden or de-emphasized

- Docling is removed from this build; it may return in a later beta.
- Real Baidu Unlimited-OCR setup and inference are outside this friend round.
- Baidu simulation is internal workflow QA only and is not OCR-quality
  evidence.
- Chat, cloud upload, document libraries, agents, and remote control remain out
  of scope.

## Breaking changes / migration

None for testers. Existing local run artifacts remain compatible. A stored
Docling provider selection falls back to Apple Vision on first launch. Testers
upgrading from beta.16 or later should use **Check for Updates…**; the GitHub
Releases page is the fallback if in-app updating fails.

## Install and five-minute test

1. Download `Okra-0.5.0-beta.20.dmg` from the
   [beta.20 GitHub prerelease](https://github.com/okra-project/desktop/releases/tag/desktop-v0.5.0-beta.20).
2. Optionally download the adjacent `.sha256` file and run
   `shasum -a 256 -c Okra-0.5.0-beta.20.dmg.sha256` from the Downloads folder.
3. Open the DMG, drag **Okra** to **Applications**, eject the DMG, and open the
   app from Finder's Applications folder.
4. Open or drop a PDF and confirm that no extraction begins automatically.
5. Leave **Apple Vision** selected, click **Parse**, turn on **Show boxes**,
   and hover an extracted block to see its source box light up (and the
   reverse).
6. Copy the Markdown and save a `.md` file with **Save As**.

## Feedback and privacy

Reply directly to the maintainer who sent you this build for lightweight
feedback. For a technical bug, [open a GitHub issue](https://github.com/okra-project/desktop/issues/new)
with your macOS version, Mac model/chip, PDF type and page count, reproduction
steps, expected and actual behavior, and a screenshot when useful.

Do not attach confidential PDFs or paste sensitive extracted text into a public
issue. Describe the document shape or reproduce the problem with a
non-sensitive substitute.

## Validation

Candidate validation is pending. Before this prerelease is sent to friends, the
exact downloadable artifact must pass:

- brand, Python, and Swift tests;
- signed-app launch, notarization, stapling, Gatekeeper, DMG, quarantined-DMG
  LaunchServices, and signed-appcast automation;
- a second Apple-silicon Mac install through normal Gatekeeper behavior;
- the friend-core Apple Vision regression, including offline and invalid-input
  cases, plus a hover/selection pass on a rotated or cropped PDF; and
- a real signed in-place **Install and Relaunch** update.

Passing automation does not waive a failed clean-Mac or manual happy-path
check. Validation evidence belongs on the desktop milestone issues.

## Rollout

Publish beta.20 first as an unannounced GitHub prerelease candidate. Freeze its
source commit, run every gate against that exact DMG and checksum, and send the
friend link only after the candidate checks pass with zero open blocking
issues.

## Rollback

Keep beta.19 available on GitHub Releases. If beta.20 fails before the friend
link is sent, do not bless it; fix forward under a new candidate build and
repeat every gate. If a sent build regresses, direct testers to the last known
good signed DMG while the appcast is corrected.

## Owner

okraPDF desktop maintainers (`D.6.13`, okra-project/desktop). Testers may
reply directly to the maintainer who sent the build.
