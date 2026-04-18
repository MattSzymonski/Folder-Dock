#!/bin/bash

# REQUIREMENTS: npm, npx, git
# DESCRIPTION: Automates the release process for the Folder Dock VS Code extension.
#              Updates the version in package.json, builds the .vsix package,
#              commits and pushes the version bump with a git tag.
# USAGE: ./release_version.sh <version>
#
# EXAMPLE:
#   ./release_version.sh 1.1.0
#
# NOTES:
#   - Run from the repository root directory.
#   - The version should follow semver format (e.g. 1.0.0, 1.1.0, 2.0.0).
#   - After running, create a GitHub release from the pushed tag and attach the .vsix file.

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

# 4. Commit the version bump and create a tag
echo "Committing version bump..."
git add package.json
git commit -m "Release $TAG"
git tag "$TAG"

# 5. Push commit and tag
echo "Pushing to remote..."
git push
git push origin "$TAG"

echo ""
echo "Release $TAG completed!"
echo "Built: $VSIX_FILE"
echo ""
echo "Next step: Create a GitHub release from the tag and attach the .vsix file:"
echo "  https://github.com/MattSzymonski/Folder-Dock/releases/new?tag=$TAG"
