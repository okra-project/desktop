# okraPDF Desktop v0.5.0-beta.16

## Goal

Update in place. Betas no longer require downloading a new DMG from the
release page: the app checks a signed update feed itself, downloads the update,
verifies it, and relaunches into the new version on one click.

## Promoted

- Embeds **Sparkle 2**, the standard macOS in-app updater. **Check for
  Updates…** in the app menu now runs Sparkle's own flow: update available →
  download → Install and Relaunch. Automatic checks run daily.
- Updates are EdDSA-signed. The app only installs an update whose signature
  verifies against the public key baked into the bundle.
- The update feed (`appcast.xml`) lives in this repository and gains one
  signed item per published prerelease.

## Hidden

- `CFBundleVersion` is now a monotonic integer build number (UTC minute);
  Sparkle compares that, while `CFBundleShortVersionString` keeps the
  `0.5.0-beta.N` display version.
- Release automation signs the notarized DMG with the EdDSA private key (repo
  secret only), inserts the signed appcast item, and commits it back to
  `main`.
- The beta.13–15 GitHub-releases banner/checker is removed: one update path,
  no dead code.
- Sparkle.framework is embedded in `Contents/Frameworks`, signed with the
  same Developer ID, notarized, and stapled with the app.

## Breaking

None for documents, runs, or settings. The D.6.8 banner dismissal defaults
are simply no longer read.

## Validation

- 46 Swift Testing tests pass across eleven suites, plus 9 Python tests
  including signed appcast item insertion, newest-first ordering, re-run
  replacement, and well-formed namespaced XML.
- Local packaged build: Sparkle.framework embedded, ad-hoc signed bundle
  verifies, app launches with the framework loaded.
- Release automation re-runs brand, Python, Swift, signed-app launch, Apple
  notarization/stapling, Gatekeeper, DMG verification, and quarantined-DMG
  LaunchServices gates before publishing.

## Rollout

Publish `desktop-v0.5.0-beta.16` as the recommended Apple-silicon
prerelease. This is the first Sparkle-enabled build: updating *from* beta.15
still takes one manual DMG install; every later beta updates in place.

## Rollback

Point users back to `desktop-v0.5.0-beta.15`. Sparkle writes only its own
standard defaults; beta.15 ignores them.

## Owner

okraPDF desktop maintainers (`D.6.10`, okra-project/desktop#39).
