# okraPDF Desktop v0.5.0-beta.12

## Goal

Stop the progress UI from lying about long local runs. A run that is stalled
or starved of memory now says so, and heavyweight Baidu Unlimited-OCR runs
queue instead of competing for unified memory. Nothing is auto-killed or
auto-restarted; the app only reports state truthfully.

## Promoted

- Adds a passive **run-health warning** to the progress card. When a running
  extraction produces no progress updates for 90 seconds, the UI shows
  "Taking longer than expected — no progress updates for N …" alongside the
  last real status instead of sitting on a static message.
- Surfaces **system memory pressure** while a run is active. When free memory
  is critically low with meaningful swap use (or swap is nearly exhausted),
  the UI shows "Low on memory — parsing may be slow or stuck. Quitting heavy
  apps can help." so a thrashing machine is distinguishable from slow parsing.
- Serializes Baidu Unlimited-OCR worker runs across app instances with a
  cross-process file lock. Each worker loads its own multi-GB model copy into
  unified memory, so a second run now waits and shows "Waiting for another
  Baidu Unlimited-OCR run to finish…" instead of silently thrashing.
- Health warnings are UI-only and clear on the next real progress event or at
  run end. `run.json` and `events.jsonl` keep recording real progress only.

## Hidden

- Memory sampling uses `host_statistics64` free pages plus `vm.swapusage`;
  no processes are inspected, killed, or reprioritized.
- The run gate is an advisory `flock`; it queues runs but never terminates
  another instance's work. Canceling a waiting run releases the queue slot.

## Breaking

None. No manifest, checkpoint, or event-stream changes.

## Validation

- 46 Swift Testing tests pass across eleven suites, including memory-pressure
  decision logic, stall message composition, cross-process lock queuing and
  cancellation, stalled-run warnings during a live fixture run, and a silent
  health monitor on continuously progressing runs.
- Release automation re-runs brand, Python, Swift, signed-app launch, Apple
  notarization/stapling, Gatekeeper, DMG verification, and quarantined-DMG
  LaunchServices gates before publishing.

## Rollout

Publish `desktop-v0.5.0-beta.12` as the recommended Apple-silicon prerelease.

## Rollback

Point users back to `desktop-v0.5.0-beta.11`. Run manifests and checkpoints
are unchanged, so beta.11 opens the same runs and outputs.

## Owner

okraPDF desktop maintainers (`D.6.7`).
