# okraPDF Desktop v0.5.0-beta.8

## Goal

Restore reliable startup for direct-download installs and prevent clean-machine
packaging regressions from reaching another desktop release.

## Promoted

- Fixes the beta.7 startup crash after downloading or moving Okra away from the
  build Mac. Provider scripts now resolve from the resource bundle inside
  `Okra.app` instead of relying on SwiftPM's build-directory fallback.
- Adds a packaged-app smoke test that removes access to builder-only resources
  and verifies that Okra remains running after initialization.
- Adds a post-notarization test that quarantines the final DMG and launches Okra
  through LaunchServices, covering the same App Translocation path as a browser
  download before GitHub assets are published.
- Migrates the remaining unit and integration suite to Swift Testing with
  isolated defaults, unique temporary workspaces, bounded async waits, test
  tags, and failure attachments for launch diagnostics.

## Hidden

- Cloud uploads, accounts, shared libraries, agents, and remote execution remain
  outside the desktop parser release train.
- The Baidu simulation remains clearly labeled and does not load model weights.

## Breaking

None. Existing local runs and provider setup data remain compatible.

## Validation

- The public beta.7 DMG reproduces an `NSBundle.module` fatal error when launched
  from a quarantined/App Translocation path.
- 19 Swift Testing tests pass across four suites, including default app startup,
  corrupt-state recovery, provider lifecycle, and the simulated Baidu PDF E2E.
- The beta.8 packaged app remains alive with the SwiftPM build resource bundle
  hidden; its app signature and DMG checksum verify locally.
- Release automation also requires the signed, notarized, stapled DMG to survive
  a quarantined LaunchServices launch before release publication.

## Rollout

Publish `desktop-v0.5.0-beta.8` as the recommended Apple-silicon prerelease and
mark beta.7 as superseded because its direct-download startup path is broken.

## Rollback

Remove beta.8 from the recommended download link and point users to beta.6.
No data migration is required.

## Owner

okraPDF desktop maintainers (`desktop-v1.0.0` milestone, issue #14).
