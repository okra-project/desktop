# okraPDF Desktop v1.0.0-rc.3

This release candidate fixes source-PDF box visibility in dark mode. PDF
reading and extraction remain local to the Mac.

## What changed since RC.2

- **Every extracted block's source box is now visible in dark mode.** Text,
  caption, and formula boxes were drawn with appearance-dynamic label grays
  that render near-white in dark mode, making them invisible on a white PDF
  page. Only red title and section-header boxes appeared, so most blocks looked
  like they had no source box. Text, caption, and formula boxes now draw in
  orange, and uncategorized boxes in opaque gray, in both light and dark mode.
- Title, section-header, table, picture, list-item, and page-header/footer box
  colors are unchanged.

## Provider matrix

| Provider | Setup | Best fit |
| --- | --- | --- |
| Apple Vision | None; built into macOS | Zero-setup text and scanned PDFs |
| Auto (Hybrid) | Start Ollama and select an installed vision model | Mixed PDFs; native text when usable, Ollama fallback per page |
| Ollama | Start Ollama and select an installed vision model | Bring-your-own local vision model |
| Baidu Unlimited-OCR | In-app pinned 4-bit MLX model setup, about 2.4 GB | Experimental structured OCR and layout extraction |

## Install and validate

1. Download `Okra-1.0.0-rc.3.dmg` and its adjacent `.sha256` file from the
   [`desktop-v1.0.0-rc.3` GitHub prerelease](https://github.com/okra-project/desktop/releases/tag/desktop-v1.0.0-rc.3).
2. Run `shasum -a 256 -c Okra-1.0.0-rc.3.dmg.sha256`, open the DMG, and copy
   **Okra** to **Applications**.
3. Open a PDF, explicitly parse with Apple Vision, and turn on **Show boxes**.
4. With the Mac in dark mode, confirm every extracted block — not just
   headings — shows a source box on the page.

## Known limits

- This is a release candidate, not the v1.0 stable release.
- Ollama must already be installed and running for the Ollama and Auto
  (Hybrid) providers. Model installation remains an Ollama workflow.
- Output quality, speed, memory use, and supported document structures vary by
  the selected Ollama model.
- Baidu Unlimited-OCR remains an advanced path; simulation is workflow QA and
  is not evidence of real OCR quality.

## Rollout and rollback

Publish `desktop-v1.0.0-rc.3` from a commit on `main`, keep it marked as a
prerelease, and merge its generated signed-appcast branch only after the normal
PR check passes. Never move or reuse the tag. RC.2 remains available for
rollback while this candidate is validated.

## Owner

okraPDF desktop maintainers (`Stable #15`, `D.6.13`, okra-project/desktop#15,
okra-project/desktop#38).
