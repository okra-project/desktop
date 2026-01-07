#!/bin/bash
# Usage: npm run release [patch|minor|major]
# Default: patch

set -e

BUMP_TYPE=${1:-patch}
PKG_PATH="release/app/package.json"

# Get current version
CURRENT=$(node -p "require('./$PKG_PATH').version")
echo "Current version: $CURRENT"

# Bump version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
case $BUMP_TYPE in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
  *) echo "Invalid bump type: $BUMP_TYPE (use patch|minor|major)"; exit 1 ;;
esac
NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "New version: $NEW_VERSION"

# Update package.json
node -e "
const fs = require('fs');
const pkg = require('./$PKG_PATH');
pkg.version = '$NEW_VERSION';
fs.writeFileSync('./$PKG_PATH', JSON.stringify(pkg, null, 2) + '\n');
"

# Commit, tag, push
git add "$PKG_PATH"
git commit -m "chore: bump version to $NEW_VERSION"
git tag "v$NEW_VERSION"
git push && git push origin "v$NEW_VERSION"

echo "Released v$NEW_VERSION"
