#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
sha="${CF_PAGES_COMMIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo dev)}"
short="${sha:0:7}"
# Accept only revision text, never arbitrary JavaScript in a generated module.
if [[ ! "$short" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "Invalid revision" >&2
  exit 1
fi
rm -rf -- dist
mkdir -p dist
cp index.html manifest.json sw.js README.md CONTRIBUTING.md SECURITY.md LICENSE THIRD_PARTY_NOTICES.md dist/
cp -R src vendor public licenses dist/
printf "export const VERSION = '%s';\n" "$short" > dist/version.js
