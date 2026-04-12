#!/usr/bin/env bash
# tools/test_zoom.sh
#
# Builds a production preview, starts it locally, runs the puppeteer
# zoom smoke-test, then tears the preview server down.
#
# Prerequisites (installed by bootstrap.sh / npm ci):
#   - node + npm
#   - puppeteer (devDependency → installed via npm ci)
#
# Usage:
#   npm run test:zoom
#   bash tools/test_zoom.sh
#   bash tools/test_zoom.sh http://localhost:8080   # test against running docker

set -euo pipefail

cd "${BUILD_WORKSPACE_DIRECTORY:-$(pwd)}"

TARGET_URL="${1:-}"

if [[ -n "$TARGET_URL" ]]; then
  echo "Running zoom test against existing server: $TARGET_URL"
  node tools/test_zoom.js "$TARGET_URL"
  exit $?
fi

# ── No URL given: build + preview ──────────────────────────────────────────

if [[ ! -d node_modules ]] || [[ ! -d node_modules/puppeteer ]]; then
  echo "Installing dependencies (including puppeteer)..."
  # Use npm install rather than npm ci so puppeteer resolves even if
  # package-lock.json was generated before it was added to devDependencies.
  npm install
fi

# Ensure puppeteer's bundled browser is downloaded
npx puppeteer browsers install chrome 2>/dev/null || true

echo "Building for preview..."
VITE_BASE_PATH=/ npm run build >/tmp/echo-surface-test-build.log 2>&1

echo "Starting preview server..."
npx vite preview --host 127.0.0.1 --port 4174 >/tmp/echo-surface-test-preview.log 2>&1 &
preview_pid=$!

cleanup() {
  echo "Stopping preview server (pid $preview_pid)..."
  kill "$preview_pid" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for preview to be ready
echo "Waiting for preview server..."
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:4174/" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "Running zoom test..."
node tools/test_zoom.js "http://127.0.0.1:4174"
