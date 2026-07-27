#!/bin/zsh
set -euo pipefail

provider_root="$1"
python_bin=""

for candidate in /opt/homebrew/bin/python3.13 /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
  if [[ -x "$candidate" ]]; then
    python_bin="$candidate"
    break
  fi
done

if [[ -z "$python_bin" ]]; then
  print -u2 "Python 3 is required to set up Baidu Unlimited-OCR."
  exit 1
fi

mkdir -p "$provider_root/huggingface"
"$python_bin" -m venv "$provider_root/venv"
"$provider_root/venv/bin/python" -m pip install --upgrade pip "mlx-vlm==0.6.6" "huggingface-hub==1.24.0"

HF_HOME="$provider_root/huggingface" \
  "$provider_root/venv/bin/python" - "$provider_root/model" <<'PY'
import sys
from huggingface_hub import snapshot_download

snapshot_download(
    repo_id="sahilchachra/unlimited-ocr-4bit-mlx",
    revision="5df80100fca719eca44a4f5ec2e5a63d31881eb6",
    local_dir=sys.argv[1],
)
PY

"$provider_root/venv/bin/python" -m pip freeze > "$provider_root/installed-packages.txt"
date -u +%Y-%m-%dT%H:%M:%SZ > "$provider_root/.ready"
