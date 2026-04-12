#!/usr/bin/env bash
# tools/test_zoom.sh
#
# Zoom smoke-test for EchoSurface.
# Puppeteer is installed on-demand into test-tools/ so it never
# touches the main node_modules or package-lock.json, and it is
# never pulled into the Docker build image.
#
# Usage:
#   npm run test:zoom                        # build preview, run test
#   bash tools/test_zoom.sh                  # same
#   bash tools/test_zoom.sh http://localhost:8080  # test against running docker

set -euo pipefail

cd "${BUILD_WORKSPACE_DIRECTORY:-$(pwd)}"

TARGET_URL="${1:-}"

# ── Ensure puppeteer is available in test-tools/ ───────────────────────────
TEST_DIR="test-tools"
if [[ ! -d "$TEST_DIR/node_modules/puppeteer" ]]; then
  echo "Installing puppeteer into $TEST_DIR/ (one-time, not part of the main build)..."
  mkdir -p "$TEST_DIR"
  # Write a minimal package.json if one doesn't exist yet
  if [[ ! -f "$TEST_DIR/package.json" ]]; then
    echo '{"name":"echo-surface-tests","private":true,"type":"commonjs"}' > "$TEST_DIR/package.json"
  fi
  npm install --prefix "$TEST_DIR" puppeteer
  echo "Puppeteer installed."
fi

# ── If a URL was supplied, run against it directly ─────────────────────────
if [[ -n "$TARGET_URL" ]]; then
  echo "Running zoom test against existing server: $TARGET_URL"
  node --experimental-vm-modules tools/test_zoom.js "$TARGET_URL"
  exit $?
fi

# ── Otherwise build + preview ──────────────────────────────────────────────

if [[ ! -d node_modules ]]; then
  echo "Installing project dependencies..."
  npm ci
fi

echo "Building for preview..."
VITE_BASE_PATH=/ npm run build >/tmp/echo-surface-test-build.log 2>&1

echo "Starting preview server on port 4174..."
npx vite preview --host 127.0.0.1 --port 4174 >/tmp/echo-surface-test-preview.log 2>&1 &
preview_pid=$!

cleanup() {
  echo "Stopping preview server (pid $preview_pid)..."
  kill "$preview_pid" 2>/dev/null || true
}
trap cleanup EXIT

echo "Waiting for preview server..."
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:4174/" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "Running zoom test..."
node tools/test_zoom.js "http://127.0.0.1:4174"
