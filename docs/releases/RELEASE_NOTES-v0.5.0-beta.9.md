# okraPDF Desktop v0.5.0-beta.9

## Goal

Ship the canonical green okra mark in the downloadable app and make long PDF
extractions durable and inspectable one page at a time.

## Promoted

- Replaces the obsolete yellow `Okra` wordmark icon with the same green okra
  glyph used by the website and Storybook.
- Uses the mark alone inside desktop chrome. The product wordmark is no longer
  displayed beside it; `Okra` remains only where macOS requires an application
  or menu name and as the mark's accessible fallback.
- Bundles the canonical mark as a Swift package resource and verifies its exact
  website SHA-256 digest during tests.
- Persists each completed OCR page atomically under the run directory before
  processing the next page. Interrupted large-document runs retain readable
  page results and recover progress from those checkpoints.
- Reassembles final Markdown from numeric page order while preserving page-level
  progress in `run.json`.

## Hidden

- Cloud uploads, accounts, shared libraries, agents, and remote execution remain
  outside the desktop parser release train.
- The Baidu simulation remains clearly labeled and does not load model weights.

## Breaking

None. Existing local runs, provider setup data, and beta.8 application-support
paths remain compatible.

## Validation

- The source mark matches the website asset digest
  `155f9c81bc50ab916658c12f8f1500ff2a08fcccb641339c79e8846733740152`.
- 28 Swift Testing tests pass across six suites, including the canonical-mark
  checksum, 120-page checkpoint persistence, interrupted-run recovery, startup,
  provider lifecycle, and simulated Baidu PDF workflow.
- A local beta.9 preflight app survives packaged-resource isolation; its
  generated `.icns` visibly contains the green okra glyph and its DMG checksum
  verifies.
- Release automation additionally requires Developer ID signing, app and DMG
  notarization/stapling, Gatekeeper assessment, and a quarantined DMG launch
  through LaunchServices before publication.

## Rollout

Publish `desktop-v0.5.0-beta.9` as the recommended Apple-silicon prerelease and
mark beta.8 as superseded because it contains the obsolete yellow icon.

## Rollback

Point users back to `desktop-v0.5.0-beta.8`. No data migration is required, but
the old visual identity will return.

## Owner

okraPDF desktop maintainers (`D.6.4`).
