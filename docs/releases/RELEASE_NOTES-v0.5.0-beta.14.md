# okraPDF Desktop v0.5.0-beta.14

## Goal

Put the beta train on a stable, public home so the in-app update check works
for every user, not just the repo owner.

## Promoted

- The repository moved to the **okra-project** GitHub org
  (`okra-project/okrapdf-desktop`) and is now public under the FSL-1.1-ALv2
  license. Download links, releases, and history all carried over; the old
  URL redirects.
- The in-app update check now queries the canonical org releases URL. Public
  visibility is what makes the unauthenticated releases API usable at all —
  on the private repo the check could only ever stay silent.
- No functional changes to parsing, runs, or the update banner.

## Hidden

- Pre-public secret audit was clean: no credentials in current files or git
  history, placeholder-only installer examples, FSL-1.1-ALv2 LICENSE already
  in place.
- Signed build, notarization, and release publishing continue on the same
  self-hosted Mac runner, now proven against the org repo.

## Breaking

None. The old `steventsao/okrapdf-desktop` URL redirects for web, git, and
API clients, so beta.13's update check keeps working.

## Validation

- 55 Swift Testing tests pass across thirteen suites; 5 Python worker tests
  pass; brand surface check passes.
- This release itself proves the post-transfer pipeline: self-hosted runner,
  signing secrets, notarization, stapling, Gatekeeper, DMG verification, and
  quarantined-DMG LaunchServices gates all ran against `okra-project`.

## Rollout

Publish `desktop-v0.5.0-beta.14` as the recommended Apple-silicon prerelease.

## Rollback

Point users back to `desktop-v0.5.0-beta.13`.

## Owner

okraPDF desktop maintainers (`D.6.8`).
