#!/usr/bin/env bash

set -euo pipefail

cd "${BUILD_WORKSPACE_DIRECTORY:-$(pwd)}"

if [[ ! -d node_modules ]]; then
  npm ci
fi

exec npm run build
