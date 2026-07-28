#!/usr/bin/env sh
# Local Hexo Admin launcher for macOS and Linux.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$script_dir"
panel_url="http://127.0.0.1:4190"

if command -v curl >/dev/null 2>&1 && curl --silent --fail --max-time 1 "$panel_url/api/project/status" >/dev/null 2>&1; then
  echo "Hexo Admin is already running at $panel_url"
  if command -v open >/dev/null 2>&1; then open "$panel_url" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$panel_url" >/dev/null 2>&1 || true
  fi
  exit 0
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] Node.js and npm are required. Install the current Node.js LTS release first." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing blog dependencies..."
  npm install
fi

if [ ! -d admin/node_modules ]; then
  echo "Installing admin dependencies..."
  npm --prefix admin install
fi

echo "Building Hexo Admin..."
npm run admin:build
echo "Starting Hexo Admin at $panel_url"
echo "Keep this terminal open while using the panel. Press Ctrl+C to stop it."
npm run admin:start
