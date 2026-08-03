# okraPDF Desktop v0.5.0-beta.10

## Goal

Turn Baidu Unlimited-OCR's raw token stream into readable local output and a
stable layout-aware JSON contract.

## Promoted

- Decodes the byte-level whitespace markers that some MLX and Ollama model
  conversions expose as visible `Ġ`, `Ċ`, and `ĉ` characters.
- Parses Baidu/DeepSeek-style `<|det|>type [x1, y1, x2, y2]<|/det|>` spans into
  typed blocks with both the original 0–1000 coordinates and normalized
  `{x, y, width, height}` boxes.
- Preserves layout content such as HTML tables and LaTeX while producing clean
  per-page Markdown.
- Removes exact duplicate layout blocks and truncates repeated generation tails
  deterministically. Structured diagnostics report decoded artifacts, malformed
  markers, removed blocks, and detected loops.
- Persists every completed Baidu page as both `page-NNNN.md` and
  `page-NNNN.json`, then maintains aggregate `result.md` and `result.json`
  outputs. Interrupted work keeps the completed page records.
- Adds Preview, Markdown, and JSON modes in the extraction inspector. Preview
  renders block type, text, normalized location, and repetition cleanup without
  showing model control tokens.

## Hidden

- Raw model text is not copied into the structured JSON or shown in the app.
- Cloud uploads, accounts, shared libraries, agents, and remote execution remain
  outside the desktop parser release train.

## Breaking

None. Existing runs without `result.json` continue to open as Markdown. The new
`structuredOutputPath` field in `run.json` is optional.

## Validation

- The supplied real-world model payload reduces from 425 raw detections to 35
  unique layout blocks, removes 391 repeated blocks, reports the malformed
  detection prefix, and contains no visible whitespace or detection tokens in
  the resulting Markdown.
- Four Python parser tests cover tokenizer decoding, tagged and Ollama-style
  layout lines, malformed marker recovery, normalized boxes, HTML table
  preservation, plain-text fallback, loop suppression, and JSON round trips.
- 30 Swift Testing tests pass across seven suites, including structured JSON
  decoding, readable HTML-table previews, and the simulated Baidu PDF → pages →
  Markdown + JSON → persisted-run workflow.
- Release automation runs both parser and Swift tests before Developer ID
  signing, app and DMG notarization/stapling, Gatekeeper assessment, and the
  quarantined-DMG LaunchServices check.

## Rollout

Publish `desktop-v0.5.0-beta.10` as the recommended Apple-silicon prerelease.

## Rollback

Point users back to `desktop-v0.5.0-beta.9`. Existing JSON sidecars are ignored
by older builds, so no data migration is required.

## Owner

okraPDF desktop maintainers (`D.6.5`).
