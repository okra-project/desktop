# okraPDF Desktop v0.5.0-beta.21

This candidate adds a durable page-level parser lifecycle to the selected-tester
macOS beta. It remains a prerelease, not the v1.0 stable promise.

## Goal

Make a long local parse understandable without interpreting a percentage or a
free-form log message. Every page for every participating parser now has one
canonical, persisted state: `idle`, `inProgress`, `done`, `attention`, or
`error`.

## What changed since beta.20

- `run.json` persists a provider-neutral `pageLifecycles` matrix keyed by parser
  ID and one-based page number. Existing manifests without the field still
  decode and receive a compatible projection when reopened.
- Apple Vision, Baidu Unlimited-OCR, and the deterministic test providers report
  page start, durable completion, attention, and failure through the same
  progress contract.
- Cancellation, orphan recovery, and a run-health warning move an active or
  next unfinished page to **Needs attention**. Parser failures move the page to
  **Error**. Retry can move either state back to **In progress**.
- **Done** is terminal for a run and is emitted only after durable page output
  exists. Looking at a page or reopening the app never changes parse truth.
- The Extract inspector renders a lazy horizontal page strip for each parser.
  Every state has visible text and a distinct symbol as well as color, plus a
  VoiceOver label containing parser, page, state, and detail.

## Promoted interfaces

- The five-state page lifecycle in the Extract inspector.
- Durable parser/page lifecycle entries in the local run manifest.
- Provider-neutral lifecycle reporting for current and future local parsers.

## Hidden or de-emphasized

- This is not an arbitrary workflow DAG or multi-agent runtime.
- Parser lifecycle state is device-local and is not synchronized to an account.
- `attention` is parser work that needs retry or a decision; it is not a claim
  that extraction failed.

## Breaking changes / migration

None. `pageLifecycles` is optional when decoding older `run.json` files. The app
reconstructs completed pages from the durable counts and maps an unfinished
running, interrupted, or failed page to the appropriate canonical state.

## Validation

- Canonical names, allowed transitions, parser/page identity, multi-parser
  isolation, rollups, presentation, Codable round trips, and legacy decoding.
- Mid-run persistence, cancellation to attention, failure to error, health
  warning to attention, completion to done, reopen recovery, and retry.
- Full Swift, Python worker, brand, and release-build checks before tagging.

## Rollout

Merge the tested implementation to `main`, then publish beta.21 only after the
existing signed, notarized, Gatekeeper, quarantined-DMG, and appcast gates pass.

## Rollback

Keep beta.20 available. Older builds ignore the new optional manifest field;
beta.21 continues to decode runs created before this field existed.

## Owner

okraPDF desktop maintainers (`D.6.14`, okra-project/desktop#54).
