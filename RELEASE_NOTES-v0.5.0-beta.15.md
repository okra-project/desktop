# okraPDF Desktop v0.5.0-beta.15

## Goal

Settle the beta train on its permanent name: `okra-project/desktop`.

## Promoted

- The repository is now **`okra-project/desktop`** (public, FSL-1.1-ALv2).
  The legacy M-MAC editor repo that previously held the name was renamed to
  the private, archived `okra-project/desktop-editor-legacy`.
- The in-app update check and README download link point at the canonical
  `okra-project/desktop` releases URL. Older betas keep working — GitHub
  redirects the previous repo name.
- No functional changes to parsing, runs, or the update banner.

## Hidden

- The legacy editor's full history is archived read-only in the org and
  mirrored locally; nothing was deleted.
- Signed build, notarization, and release publishing continue on the same
  self-hosted Mac runner, proven again under the final repo name.

## Breaking

None. `okra-project/okrapdf-desktop` and the original
`steventsao/okrapdf-desktop` URLs both redirect, so beta.13 and beta.14
update checks keep resolving.

## Validation

- 55 Swift Testing tests pass across thirteen suites; 5 Python worker tests
  pass; brand surface check passes.
- This release itself proves the pipeline under the final name: self-hosted
  runner, signing secrets, notarization, stapling, Gatekeeper, DMG
  verification, and quarantined-DMG LaunchServices gates.

## Rollout

Publish `desktop-v0.5.0-beta.15` as the recommended Apple-silicon prerelease.

## Rollback

Point users back to `desktop-v0.5.0-beta.14`.

## Owner

okraPDF desktop maintainers (`D.6.8`).
