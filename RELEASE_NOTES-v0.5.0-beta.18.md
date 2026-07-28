# okraPDF Desktop v0.5.0-beta.18

## Goal

Review Baidu Unlimited-OCR against the source. Every valid detected layout box
now appears directly over the original PDF and stays aligned while the reader
zooms, scrolls, crops, or displays a rotated page.

## Promoted

- Renders Baidu's normalized top-left bounding boxes as native, screen-only
  PDFKit annotations without modifying or printing them into the source PDF.
- Uses the web viewer's layout semantics: tables are blue, pictures purple,
  titles and section headers red, page headers and footers brown, lists green,
  and ordinary text neutral.
- Clicking a PDF box selects and scrolls to its block card; clicking a block
  card selects and navigates to its source box.
- Adds an accessible **Show boxes** toolbar toggle. Selecting a block restores
  hidden boxes, and Reduce Motion removes animated preview scrolling.

## Hidden

- Invalid, non-normalized, non-finite, empty, or fully off-page boxes are
  rejected; partial boxes are clipped safely to the source page.
- Crop-box offsets and PDF page rotation are handled before annotation bounds
  are installed, so PDFKit owns zoom and scroll alignment.
- Overlay annotations are owned separately from native document annotations and
  are removed when the document, provider, or visibility state changes.
- The Baidu simulation fixture now emits a representative detection box so the
  end-to-end workflow exercises the visible overlay without model weights.

## Breaking

None. Existing runs remain compatible. Only successful Baidu Unlimited-OCR
`result.json` blocks with valid normalized boxes receive an overlay.

## Validation

- 52 Swift tests across 12 suites and 9 Python tests pass.
- Swift coverage includes normalization and clipping, Baidu-only adaptation,
  crop/rotation geometry, screen-only annotation styling, annotation ownership,
  PDF click selection, coordinator selection state, and the simulated Baidu PDF
  end-to-end flow.
- Release automation re-runs brand, Python, Swift, signed-app launch, Apple
  notarization/stapling, Gatekeeper, DMG verification, and quarantined-DMG
  LaunchServices gates before publishing.

## Rollout

Merge the release PR, confirm the `desktop-v0.5.0-beta.18` milestone has zero
open items, close the milestone, then publish the matching tag. The notarized
release workflow will publish the Apple-silicon DMG, checksum, and signed
Sparkle appcast entry.

## Rollback

Point users back to `desktop-v0.5.0-beta.17`. The feature adds no migration and
does not modify PDFs, existing run manifests, or stored structured output.

## Owner

okraPDF desktop maintainers (`D.6.11`, okra-project/desktop#41).
