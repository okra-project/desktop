# okraPDF Desktop v0.5.0-beta.19

This is a selected-tester friends beta for Apple-silicon Macs running macOS 13
or later. It is a prerelease, not the v1.0 stable promise. PDF processing in the
tested path is local-only.

## Goal

Prove that a friend can install okraPDF through the normal macOS path, open or
drop a PDF without accidentally starting work, explicitly parse it with the
zero-setup Apple Vision provider, copy or save Markdown, and receive the next
signed beta in place.

## Promoted interfaces

- A five-minute Apple Vision path: open or drop a PDF, click **Parse**, then
  copy the Markdown or use **Save As** to write a `.md` file.
- A Developer ID signed, Apple-notarized DMG with an optional published
  SHA-256 check.
- Sparkle's signed **Check for Updates…** → **Install and Relaunch** flow.
- A privacy-safe feedback path owned directly by the desktop maintainer.

## Hidden or de-emphasized

- Real Docling setup and inference are outside this friend round.
- Real Baidu Unlimited-OCR setup and inference are outside this friend round.
- Baidu simulation is internal workflow QA only and is not OCR-quality
  evidence.
- Chat, cloud upload, document libraries, agents, and remote control remain out
  of scope.

## Breaking changes / migration

None. Existing local run artifacts remain compatible. Testers upgrading from
beta.16 or later should use **Check for Updates…**; the GitHub Releases page is
the fallback if in-app updating fails.

## Install and five-minute test

1. Download `Okra-0.5.0-beta.19.dmg` from the
   [beta.19 GitHub prerelease](https://github.com/okra-project/desktop/releases/tag/desktop-v0.5.0-beta.19).
2. Optionally download the adjacent `.sha256` file and run
   `shasum -a 256 -c Okra-0.5.0-beta.19.dmg.sha256` from the Downloads folder.
3. Open the DMG, drag **Okra** to **Applications**, eject the DMG, and open the
   app from Finder's Applications folder.
4. Open or drop a PDF and confirm that no extraction begins automatically.
5. Leave **Apple Vision** selected, click **Parse**, copy the Markdown, and save
   a `.md` file with **Save As**.

## Feedback and privacy

Reply directly to the maintainer who sent you this build for lightweight
feedback. For a technical bug, [open a GitHub issue](https://github.com/okra-project/desktop/issues/new)
with your macOS version, Mac model/chip, PDF type and page count, reproduction
steps, expected and actual behavior, and a screenshot when useful.

Do not attach confidential PDFs or paste sensitive extracted text into a public
issue. Describe the document shape or reproduce the problem with a
non-sensitive substitute.

## Validation

Candidate validation is pending. Before this prerelease is sent to friends, the
exact downloadable artifact must pass:

- brand, Python, and Swift tests;
- signed-app launch, notarization, stapling, Gatekeeper, DMG, quarantined-DMG
  LaunchServices, and signed-appcast automation;
- a second Apple-silicon Mac install through normal Gatekeeper behavior;
- the friend-core Apple Vision regression, including offline and invalid-input
  cases; and
- a real signed in-place **Install and Relaunch** update.

Passing automation does not waive a failed clean-Mac or manual happy-path
check. Validation evidence belongs on milestone issues #39 and #47–#50.

## Rollout

Publish beta.19 first as an unannounced GitHub prerelease candidate. Freeze its
source commit, run every gate against that exact DMG and checksum, and send the
friend link only after the `desktop-v0.5.0-beta.19` milestone has zero open
issues. Do not publish beta.20 between the successful candidate checks and
sending the link.

## Rollback

Keep beta.18 available on GitHub Releases. If beta.19 fails before the friend
link is sent, do not bless it; fix forward under a new candidate build and
repeat every gate. If a sent build regresses, direct testers to the last known
good signed DMG while the appcast is corrected.

## Owner

okraPDF desktop maintainers (`D.6.12`, okra-project/desktop#50). Testers may
reply directly to the maintainer who sent the build.
