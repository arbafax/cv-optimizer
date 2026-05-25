#!/usr/bin/env bash
set -e

VERSION_FILE="frontend/version.json"

# Read current version
current=$(grep -o '"version": *"[^"]*"' "$VERSION_FILE" | grep -o '[0-9]*\.[0-9]*\.[0-9]*')
if [ -z "$current" ]; then
  current="1.0.0"
fi

IFS='.' read -r major minor patch <<< "$current"
patch=$((patch + 1))
new_version="$major.$minor.$patch"
built=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

printf '{"version": "%s", "built": "%s"}\n' "$new_version" "$built" > "$VERSION_FILE"

git add "$VERSION_FILE"
git commit -m "Publish v${new_version}"

echo "Pushing main to origin..."
git push origin main

echo "Publishing v${new_version} to gh-pages..."
git subtree push --prefix frontend origin gh-pages

echo "Done — v${new_version} is live."
