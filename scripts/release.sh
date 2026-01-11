#!/bin/bash
set -e

# Usage: ./scripts/release.sh [patch|minor|major]
# Default: patch

TYPE=${1:-patch}

cd "$(dirname "$0")/.."

# Bump version
cd release/app
NEW_VERSION=$(npm version $TYPE --no-git-tag-version | sed 's/v//')
cd ../..

echo "Releasing v$NEW_VERSION"

# Commit, tag, push
git add release/app/package.json
git commit -m "chore: release v$NEW_VERSION"
git tag "v$NEW_VERSION"
git push origin main --tags

echo "✓ Pushed v$NEW_VERSION - CI will build and upload"
echo "  Track: gh run watch"
