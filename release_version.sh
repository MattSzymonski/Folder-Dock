#!/bin/bash

# REQUIREMENTS: npm, npx, gh (GitHub CLI)
# DESCRIPTION: Automates the release process for the Folder Dock VS Code extension.
#              Updates the version in package.json, builds the .vsix package,
#              commits and pushes the version bump, and creates a GitHub release
#              with auto-generated notes and the .vsix file attached.
# USAGE: ./release_version.sh <version>
#
# EXAMPLE:
#   ./release_version.sh 1.1.0
#
# NOTES:
#   - Requires GitHub CLI to be authenticated (gh auth login).
#   - Run from the repository root directory.
#   - The version should follow semver format (e.g. 1.0.0, 1.1.0, 2.0.0).

# --- SCRIPT ---

set -e

if [ -z "$1" ]; then
  echo "Usage: ./release_version.sh <version>"
  echo "Example: ./release_version.sh 1.1.0"
  exit 1
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: You have uncommitted changes. Please commit or stash them before releasing."
  git status --short
  exit 1
fi

VERSION="$1"
TAG="v$VERSION"
VSIX_FILE="folder-dock-$VERSION.vsix"

# 1. Update version in package.json
echo "Updating package.json version to $VERSION..."
npm version "$VERSION" --no-git-tag-version

# 2. Build the .vsix file
echo "Building .vsix package..."
npx @vscode/vsce package

# 3. Verify .vsix was created
if [ ! -f "$VSIX_FILE" ]; then
  echo "Error: $VSIX_FILE not found"
  exit 1
fi

# 4. Commit the version bump
echo "Committing version bump..."
git add package.json
git commit -m "Release $TAG"
git push

# 5. Create GitHub release with tag and attach .vsix
echo "Creating GitHub release $TAG..."
gh release create "$TAG" "$VSIX_FILE" \
  --title "$TAG" \
  --generate-notes

echo "Release $TAG published successfully!"
