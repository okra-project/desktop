#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_root="$(cd "$script_dir/.." && pwd)"
pdf_path="${1-}"

if [[ -z "$pdf_path" || ! -f "$pdf_path" ]]; then
  echo "Usage: $0 /absolute/path/to/document.pdf" >&2
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

cd "$project_root"
echo "Verifying the Baidu Unlimited-OCR simulation against: $pdf_path"
OKRA_DESKTOP_E2E_PDF="$pdf_path" \
  swift test --filter testBaiduUnlimitedOCREndToEndSimulationOnPDF

echo "Building the okraPDF desktop app in Baidu Unlimited-OCR simulation mode..."
swift build --product Okra
echo "Opening: $pdf_path"
echo "Click 'Parse with Baidu Unlimited-OCR' to exercise the simulated local workflow."
OKRA_DESKTOP_SIMULATE_UNLIMITED_OCR=1 swift run --skip-build Okra "$pdf_path"
