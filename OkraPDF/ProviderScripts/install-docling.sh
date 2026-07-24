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
  print -u2 "Python 3 is required to set up Docling."
  exit 1
fi

mkdir -p "$provider_root"
"$python_bin" -m venv "$provider_root/venv"
"$provider_root/venv/bin/python" -m pip install --upgrade pip "docling==2.114.0"
"$provider_root/venv/bin/docling-tools" models download --output-dir "$provider_root/models"
"$provider_root/venv/bin/python" -m pip freeze > "$provider_root/installed-packages.txt"
date -u +%Y-%m-%dT%H:%M:%SZ > "$provider_root/.ready"
