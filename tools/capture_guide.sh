#!/usr/bin/env bash

set -euo pipefail

cd "${BUILD_WORKSPACE_DIRECTORY:-$(pwd)}"

if [[ ! -d node_modules ]]; then
  npm ci
fi

chrome_bin="${GOOGLE_CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

if [[ ! -x "$chrome_bin" ]]; then
  echo "Google Chrome was not found at $chrome_bin" >&2
  exit 1
fi

VITE_BASE_PATH=/ npm run build >/tmp/echo-surface-build.log
npx vite preview --host 127.0.0.1 --port 4173 >/tmp/echo-surface-preview.log 2>&1 &
preview_pid=$!

cleanup() {
  kill "$preview_pid" >/dev/null 2>&1 || true
}

trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:4173/" >/dev/null; then
    break
  fi
  sleep 1
done

mkdir -p public/guide

capture() {
  local preset="$1"
  local target="$2"

  "$chrome_bin" \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --window-size=1440,980 \
    --virtual-time-budget=2400 \
    --screenshot="$target" \
    "http://127.0.0.1:4173/?mode=capture&preset=${preset}" >/tmp/echo-surface-chrome.log 2>&1
}

capture "seed" "public/guide/seed.png"
capture "trace" "public/guide/trace.png"
capture "hold" "public/guide/hold.png"

echo "Guide screenshots updated in public/guide"
