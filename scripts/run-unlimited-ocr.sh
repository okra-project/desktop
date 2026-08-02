#!/usr/bin/env bash
# Run Baidu Unlimited-OCR on a PDF end to end: render pages to images, then
# invoke the bundled worker. The model only accepts image input — never hand
# it a PDF directly.
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_root="$(cd "$script_dir/.." && pwd)"
worker_script="$project_root/OkraPDF/ProviderScripts/unlimited-ocr-worker.py"
renderer_script="$project_root/OkraPDF/ProviderScripts/render-pdf-pages.swift"
provider_root="$HOME/.okra/providers/unlimited-ocr"

simulate=0
if [[ "${1-}" == "--simulate" ]]; then
  simulate=1
  shift
fi

pdf_path="${1-}"
output_dir="${2-}"

if [[ -z "$pdf_path" || ! -f "$pdf_path" ]]; then
  echo "Usage: $0 [--simulate] /absolute/path/to/document.pdf [output-dir]" >&2
  exit 64
fi

pdf_name="$(basename "$pdf_path")"
case "${pdf_name##*.}" in
  pdf|PDF) ;;
  *)
    echo "Choose a PDF file." >&2
    exit 64
    ;;
esac
pdf_directory="$(cd "$(dirname "$pdf_path")" && pwd)"
pdf_path="$pdf_directory/$pdf_name"
pdf_stem="${pdf_name%.*}"

if [[ -z "$output_dir" ]]; then
  output_dir="$pdf_directory/$pdf_stem-unlimited-ocr"
fi
mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd)"
pages_dir="$output_dir/pages"
page_results_dir="$output_dir/page-results"
progress_manifest="$output_dir/page-progress.json"
result_md="$output_dir/result.md"

if [[ "$simulate" == 1 ]]; then
  python_bin="${OKRA_UNLIMITED_OCR_PYTHON:-}"
  if [[ -z "$python_bin" ]]; then
    for candidate in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
      if [[ -x "$candidate" ]]; then python_bin="$candidate"; break; fi
    done
  fi
  model_dir="$output_dir/model-simulated"
else
  python_bin="$provider_root/venv/bin/python"
  model_dir="$provider_root/model"
  if [[ ! -f "$provider_root/.ready" || ! -x "$python_bin" || ! -d "$model_dir" ]]; then
    echo "Baidu Unlimited-OCR is not set up. Open okraPDF and run the provider setup (~2.4 GB download) first." >&2
    exit 69
  fi
fi

shopt -s nullglob
prepared_pages=("$pages_dir"/page-*.png)
if [[ ${#prepared_pages[@]} -eq 0 ]]; then
  echo "Rendering PDF pages to images…"
  /usr/bin/env swift "$renderer_script" "$pdf_path" "$pages_dir"
else
  echo "Reusing ${#prepared_pages[@]} prepared page image(s) in $pages_dir"
fi

page_images=("$pages_dir"/page-*.png)
if [[ ${#page_images[@]} -eq 0 ]]; then
  echo "No page images were produced from $pdf_path" >&2
  exit 65
fi

if [[ ! -f "$progress_manifest" ]]; then
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cat > "$progress_manifest" <<JSON
{
  "schemaVersion": 1,
  "totalPages": ${#page_images[@]},
  "createdAt": "$timestamp",
  "updatedAt": "$timestamp",
  "completedPageCount": 0,
  "currentPageNumber": null,
  "currentPageStatus": null,
  "lastCompletedPageNumber": null,
  "lastCompletedAt": null,
  "errorMessage": null
}
JSON
fi

worker_args=(
  "$worker_script"
  --model "$model_dir"
  --output "$result_md"
  --page-output-directory "$page_results_dir"
  --page-progress "$progress_manifest"
  --title "$pdf_name"
  --images "${page_images[@]}"
)
if [[ "$simulate" == 1 ]]; then
  worker_args+=(--simulate)
fi

echo "Running Baidu Unlimited-OCR on ${#page_images[@]} page(s)…"
HF_HOME="$provider_root/huggingface" \
HF_HUB_OFFLINE=1 \
TRANSFORMERS_OFFLINE=1 \
HF_DATASETS_OFFLINE=1 \
  "$python_bin" "${worker_args[@]}"

echo
echo "Markdown:   $result_md"
echo "Structured: $output_dir/result.json"
echo
"$python_bin" - "$output_dir/result.json" <<'PY'
import json
import sys

doc = json.load(open(sys.argv[1]))
total_grounded = 0
total_ungrounded = 0
for page in doc["pages"]:
    diagnostics = page["diagnostics"]
    grounded = diagnostics.get("groundedBlockCount", 0)
    ungrounded = diagnostics.get("ungroundedBlockCount", 0)
    total_grounded += grounded
    total_ungrounded += ungrounded
    print(
        f"page {page['pageNumber']}: {len(page['blocks'])} blocks "
        f"({grounded} with bbox, {ungrounded} without bbox)"
    )
    for block in page["blocks"]:
        if block["bbox"] is None:
            preview = block["text"].replace("\n", " ")[:72]
            print(f"  no bbox: [{block['type']}] {preview}")
print(f"total: {total_grounded} with bbox, {total_ungrounded} without bbox")
PY
