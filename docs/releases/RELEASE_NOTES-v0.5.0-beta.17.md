# okraPDF Desktop v0.5.0-beta.17

## Goal

Prove the beta.16 in-app update path end to end: a running beta.16 install
must find this release in the signed appcast, download it, verify the EdDSA
signature, install it in place, and relaunch — no DMG download.

## Promoted

- No product changes. This release exists so beta.16 installs have a newer
  signed update to move to, validating click-to-restart updating for every
  later beta.

## Hidden

- Release automation re-proved the appcast pipeline: DMG signed with the
  EdDSA key, signed item inserted into `appcast.xml`, committed back to
  `main`.
- Fixed the appcast lint step (XML parser instead of `plutil`).

## Breaking

None.

## Validation

- 46 Swift Testing tests and 9 Python tests pass; signed, notarized, stapled
  DMG; Gatekeeper and quarantined-launch gates in release automation.
- E2E: a fresh beta.16 install self-updates to beta.17 from the live feed.

## Rollout

Publish `desktop-v0.5.0-beta.17` as the recommended Apple-silicon
prerelease.

## Rollback

Point users back to `desktop-v0.5.0-beta.16`.

## Owner

okraPDF desktop maintainers (`D.6.10`, okra-project/desktop#39).
