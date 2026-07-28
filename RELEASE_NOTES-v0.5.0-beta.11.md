# okraPDF Desktop v0.5.0-beta.11

## Goal

Make large local extraction runs observable, cancelable, and recoverable instead
of leaving a stale `running` job after the app or provider stops.

## Promoted

- Adds a visible **Cancel Run** action. okraPDF persists `canceling` and the
  cancel timestamp before it stops provider work, then records the terminal
  `canceled` outcome without presenting cancellation as a generic failure.
- Restores the newest run whenever its PDF is reopened. An in-flight manifest
  left by a previous app process becomes `interrupted` with its last durable
  page count and a **Resume** action.
- Resumes in the same run directory. Apple Vision and Baidu Unlimited-OCR skip
  completed page checkpoints; already rendered Baidu pages and structured JSON
  are reused. Docling restarts at document scope because its CLI has no reliable
  page-completion contract.
- Persists every live progress update in the atomic `run.json` snapshot,
  including fraction, status message, updated time, page counts, and monotonic
  event sequence.
- Adds `events.jsonl`, an append-only, sequenced lifecycle stream suitable for
  polling or cursor-based inspection of start, progress, page checkpoints,
  cancel intent, interruption, resume, and terminal status.
- Propagates cancellation through detached provider work. Docling and Baidu
  child processes receive termination immediately and a forced kill after a
  bounded grace period if they do not exit.

## Hidden

- Completed page files remain the durable side-effect boundary. Resume never
  claims that an unknown in-flight page completed.
- Cloud uploads, accounts, remote execution, and background daemons remain
  outside the desktop parser release train.

## Breaking

None. The new `run.json` fields are optional, so beta.10 manifests still decode.
Beta.10 ignores `events.jsonl` and can still open completed Markdown output.

## Validation

- 33 Swift Testing tests pass across eight suites, including durable cancel
  ordering, orphaned-run recovery, same-ID checkpoint resume without rewriting
  page 1, and async provider-process termination.
- Five Python worker tests pass, including rebuilding Markdown and structured
  output entirely from an existing Baidu page checkpoint.
- Release automation re-runs brand, Python, Swift, signed-app launch, Apple
  notarization/stapling, Gatekeeper, DMG verification, and quarantined-DMG
  LaunchServices gates before publishing.

## Rollout

Publish `desktop-v0.5.0-beta.11` as the recommended Apple-silicon prerelease.

## Rollback

Point users back to `desktop-v0.5.0-beta.10`. Existing page checkpoints remain
readable; beta.10 will ignore the new lifecycle fields and event stream.

## Owner

okraPDF desktop maintainers (`D.6.6`).
