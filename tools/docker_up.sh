#!/usr/bin/env bash

set -euo pipefail

cd "${BUILD_WORKSPACE_DIRECTORY:-$(pwd)}"

docker compose up --build -d "$@"

echo
echo "Echo Surface is available at:"
echo "  http://localhost:8080"
