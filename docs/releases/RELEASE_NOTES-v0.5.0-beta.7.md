# okraPDF Desktop v0.5.0-beta.7

## Goal

Make the local PDF workflow easier to understand and make the optional Baidu
Unlimited-OCR setup behave like a native, resumable model install.

## Promoted

- A native three-pane workspace inspired by June's information architecture:
  current document and recent runs on the left, uninterrupted PDFKit reading in
  the center, and provider setup/extraction on the right.
- Recent local runs reopen from the sidebar without introducing an account,
  cloud library, or background parsing.
- Baidu Unlimited-OCR setup now reports phase and byte progress, supports
  canceling with resume data, pins the eight-file MLX checkpoint revision, and
  verifies artifact sizes and SHA-256 checksums before readiness.
- Provider runtime setup is cancellable, while real extraction remains forced
  offline after the one-time download.

## Hidden

- Cloud uploads, accounts, shared libraries, agents, and remote execution remain
  outside the desktop parser release train.
- The simulation remains clearly labeled and never represents its output as
  model-evaluated OCR.

## Breaking

None. Existing `run.json` and `result.md` artifacts remain readable, and source
PDFs continue to stay in place.

## Validation

- 14 named tests / 16 cases pass across read-before-parse behavior, explicit
  Parse, run persistence/history, setup progress and cancellation, pinned-model
  integrity metadata, Apple Vision, and the Baidu simulation.
- The packaged app completed the visible three-page PDF → rendered pages →
  bundled worker → offline flags → Markdown → recent-run workflow.
- A local `0.5.0-beta.7` app and DMG pass release compilation and ad-hoc signing;
  the published artifact is produced by the Developer ID notarization workflow.
- The full 2.4 GB checkpoint was not downloaded for this release pass; clean-
  profile model-quality dogfood remains an explicit launch gate.

## Rollout

Publish `desktop-v0.5.0-beta.7` as an Apple-silicon GitHub prerelease with a
notarized DMG and SHA-256 sidecar. Keep beta.6 available for rollback.

## Rollback

Remove beta.7 from the recommended download link and point users to
`desktop-v0.5.0-beta.6`; no data migration is required.

## Owner

okraPDF desktop maintainers (`D.6.3`).
