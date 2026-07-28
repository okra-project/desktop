#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

SURFACE_PATHS=(
  OkraPDF/App.swift
  OkraPDF/AppState.swift
  OkraPDF/Brand
  OkraPDF/ContentView.swift
  OkraPDF/Workspace
  OkraPDF/LocalProcessing
)

if rg -n '"okraPDF' "${SURFACE_PATHS[@]}" \
  --glob '*.swift' \
  --glob '!LocalProviderPaths.swift' \
  --glob '!BundledResourceLocator.swift'; then
  echo "Visible desktop copy must not render the okraPDF wordmark." >&2
  exit 1
fi

if ! rg -q 'BrandMarkView\(\)' OkraPDF/Workspace/WorkspaceToolRegistryView.swift; then
  echo "The workspace must render the canonical mark." >&2
  exit 1
fi

echo "Desktop brand surface: mark-only lockup verified"
