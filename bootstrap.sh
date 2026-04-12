#!/usr/bin/env bash

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "bootstrap.sh currently supports macOS only." >&2
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required but was not found on PATH." >&2
  exit 1
fi

formulae=(
  bazelisk
  jq
  node
)

casks=(
  docker
)

install_formula() {
  local formula="$1"

  if brew list "$formula" >/dev/null 2>&1; then
    echo "brew formula already installed: $formula"
    return
  fi

  brew install "$formula"
}

install_cask() {
  local cask="$1"

  if brew list --cask "$cask" >/dev/null 2>&1; then
    echo "brew cask already installed: $cask"
    return
  fi

  brew install --cask "$cask"
}

for formula in "${formulae[@]}"; do
  install_formula "$formula"
done

for cask in "${casks[@]}"; do
  install_cask "$cask"
done

if ! command -v bazel >/dev/null 2>&1 && command -v bazelisk >/dev/null 2>&1; then
  mkdir -p "$HOME/.local/bin"
  ln -sf "$(command -v bazelisk)" "$HOME/.local/bin/bazel"
  echo "Installed bazel shim at $HOME/.local/bin/bazel"
  echo "Add \$HOME/.local/bin to PATH if bazel is still unavailable."
fi

if [[ -f package-lock.json ]]; then
  npm ci
fi

# Download puppeteer's bundled Chromium (needed by npm run test:zoom).
# This is a no-op if the browser is already cached.
if command -v npx >/dev/null 2>&1; then
  echo "Ensuring puppeteer browser is available..."
  npx puppeteer browsers install chrome 2>/dev/null || true
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker Desktop is installed but the daemon is not running yet." >&2
  echo "Launch Docker.app once before using bazel run //:docker_up." >&2
fi

echo "Bootstrap complete."
