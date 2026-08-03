# okraPDF Desktop v1.0.0-rc.2

This release candidate replaces the model-specific Ollama setup introduced in
RC.1 with a generic, HTTP-only Ollama integration. PDF reading and extraction
remain local to the Mac.

## What changed since RC.1

- **Ollama is now an integration, not an installer.** Okra asks the local
  Ollama service for installed models through `GET /api/tags`, checks each
  model's declared capabilities through `POST /api/show`, and presents the
  compatible vision models in a picker.
- **No Ollama filesystem or CLI coupling.** Okra no longer probes binary paths,
  reads `~/.ollama/models`, runs `ollama pull`, or creates an
  `okra-chandra:q4` variant. Ollama fully owns model storage and installation.
- **Generic local vision parsing.** Standalone Ollama and Auto (Hybrid) send
  page images to the selected model through Ollama's native `POST /api/chat`
  endpoint. No Chandra model name, download size, memory requirement, or
  license is assumed.
- **Baidu remains Okra-managed.** Baidu Unlimited-OCR keeps its separate pinned,
  checksummed in-app download and offline runtime. Its setup UI is no longer
  reused for Ollama.
- **Protected appcast publishing.** Release automation now pushes the signed
  appcast update to a dedicated branch. The feed reaches `main` only through a
  normal pull request and the required `macos-checks` gate.

## Provider matrix

| Provider | Setup | Best fit |
| --- | --- | --- |
| Apple Vision | None; built into macOS | Zero-setup text and scanned PDFs |
| Auto (Hybrid) | Start Ollama and select an installed vision model | Mixed PDFs; native text when usable, Ollama fallback per page |
| Ollama | Start Ollama and select an installed vision model | Bring-your-own local vision model |
| Baidu Unlimited-OCR | In-app pinned 4-bit MLX model setup, about 2.4 GB | Experimental structured OCR and layout extraction |

Ollama model hardware and disk requirements depend on the model selected in
Ollama. Okra does not infer them from a model name or storage path.

## Install and validate

1. Download `Okra-1.0.0-rc.2.dmg` and its adjacent `.sha256` file from the
   [`desktop-v1.0.0-rc.2` GitHub prerelease](https://github.com/okra-project/desktop/releases/tag/desktop-v1.0.0-rc.2).
2. Run `shasum -a 256 -c Okra-1.0.0-rc.2.dmg.sha256`, open the DMG, and copy
   **Okra** to **Applications**.
3. For the zero-setup path, open a PDF and explicitly parse with Apple Vision.
4. For Ollama, start the Ollama service, select **Ollama** or **Auto (Hybrid)**,
   refresh models, and choose an installed model that reports vision support.
5. Confirm Okra neither asks for a model download nor displays an Ollama model
   directory. Parse a non-sensitive scanned PDF and verify Markdown output.

## Known limits

- This is a release candidate, not the v1.0 stable release.
- Ollama must already be installed and running. Model installation remains an
  Ollama workflow.
- Output quality, speed, memory use, and supported document structures vary by
  the selected Ollama model.
- Ollama parsing uses the loopback HTTP service on this Mac; Apple Vision and
  Baidu do not require that service.
- Baidu Unlimited-OCR remains an advanced path; simulation is workflow QA and
  is not evidence of real OCR quality.

## Rollout and rollback

Publish `desktop-v1.0.0-rc.2` from a commit on `main`, keep it marked as a
prerelease, and merge its generated signed-appcast branch only after the normal
PR check passes. Never move or reuse the tag. RC.1 remains available for
rollback while this candidate is validated.

## Owner

okraPDF desktop maintainers (`Stable #15`, `D.6.9`, okra-project/desktop#15,
okra-project/desktop#38).
