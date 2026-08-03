# okraPDF Desktop v0.5.0-beta.13

## Goal

Know when a newer beta exists without watching for a new download link. The
app checks GitHub releases itself and says so in the window; nothing downloads
or installs on its own.

## Promoted

- Checks the newest `desktop-v*` GitHub prerelease on launch, throttled to
  once per 24 hours, and compares it against the running
  `CFBundleShortVersionString`.
- Shows a dismissible brand banner when a newer beta exists, with a **View
  Release** action that opens the release page. Dismissal is per release tag,
  so the next beta re-announces itself.
- Adds a **Check for Updates…** menu command for an immediate check. Manual
  results are stated truthfully: up to date, update available, or could not
  check right now.
- Offline, rate-limited, or unreadable checks stay silent — the UI never
  invents update state.

## Hidden

- The check is a read-only, unauthenticated GitHub releases API call
  (`per_page=10`, desktop tags only); no telemetry, no download, no install.
- Version comparison understands the `X.Y.Z-beta.N` train: a stable core ranks
  above any beta of the same core, and malformed tags are ignored.

## Breaking

None. No manifest, checkpoint, event-stream, or settings changes.

## Validation

- 55 Swift Testing tests pass across thirteen suites, including version
  ordering, release-list selection skipping drafts and non-desktop tags,
  update-available/up-to-date/unknown outcomes, per-tag dismissal, launch
  throttle, and the manual up-to-date notice.
- Release automation re-runs brand, Python, Swift, signed-app launch, Apple
  notarization/stapling, Gatekeeper, DMG verification, and quarantined-DMG
  LaunchServices gates before publishing.

## Rollout

Publish `desktop-v0.5.0-beta.13` as the recommended Apple-silicon prerelease.

## Rollback

Point users back to `desktop-v0.5.0-beta.12`. The update check adds no
persistent state that beta.12 could misread.

## Owner

okraPDF desktop maintainers (`D.6.8`).
