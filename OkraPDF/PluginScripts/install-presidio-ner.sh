#!/bin/zsh
set -euo pipefail

plugin_root="$1"
python_bin=""

for candidate in /opt/homebrew/bin/python3.13 /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
  if [[ -x "$candidate" ]] && "$candidate" -c 'import sys; raise SystemExit(0 if (3, 10) <= sys.version_info[:2] < (3, 14) else 1)'; then
    python_bin="$candidate"
    break
  fi
done

if [[ -z "$python_bin" ]]; then
  print -u2 "Python 3.10-3.13 is required to set up Presidio NER."
  exit 1
fi

presidio_version="2.2.363"
spacy_version="3.8.14"
model_version="3.8.0"
model_sha256="293e9547a655b25499198ab15a525b05b9407a75f10255e405e8c3854329ab63"
model_url="https://github.com/explosion/spacy-models/releases/download/en_core_web_lg-${model_version}/en_core_web_lg-${model_version}-py3-none-any.whl"
download_dir="$plugin_root/downloads"
model_wheel="$download_dir/en_core_web_lg-${model_version}-py3-none-any.whl"

mkdir -p "$plugin_root" "$download_dir"
rm -f "$plugin_root/.ready"
"$python_bin" -m venv --clear "$plugin_root/venv"
"$plugin_root/venv/bin/python" -m pip install --upgrade pip
"$plugin_root/venv/bin/python" -m pip install \
  "presidio-analyzer==${presidio_version}" \
  "spacy==${spacy_version}"

curl --fail --location --retry 3 --output "$model_wheel.partial" "$model_url"
actual_sha256="$(shasum -a 256 "$model_wheel.partial" | awk '{print $1}')"
if [[ "$actual_sha256" != "$model_sha256" ]]; then
  print -u2 "The Presidio English model checksum did not match."
  rm -f "$model_wheel.partial"
  exit 1
fi
mv "$model_wheel.partial" "$model_wheel"
"$plugin_root/venv/bin/python" -m pip install "$model_wheel"
rm -f "$model_wheel"

HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 "$plugin_root/venv/bin/python" - <<'PY'
from presidio_analyzer import AnalyzerEngine

engine = AnalyzerEngine()
results = engine.analyze(
    text="Contact Jane Doe at jane@example.com.",
    language="en",
    entities=["PERSON", "EMAIL_ADDRESS"],
)
if not results:
    raise SystemExit("Presidio verification did not detect the test fixture.")
PY

"$plugin_root/venv/bin/python" -m pip freeze > "$plugin_root/installed-packages.txt"
printf '{"plugin":"presidio-ner","presidio_version":"%s","spacy_version":"%s","model":"en_core_web_lg","model_version":"%s","runtime_network":false}\n' \
  "$presidio_version" "$spacy_version" "$model_version" > "$plugin_root/runtime.json"
date -u +%Y-%m-%dT%H:%M:%SZ > "$plugin_root/.ready"
