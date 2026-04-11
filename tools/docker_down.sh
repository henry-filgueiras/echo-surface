#!/usr/bin/env bash

set -euo pipefail

cd "${BUILD_WORKSPACE_DIRECTORY:-$(pwd)}"

exec docker compose down --remove-orphans "$@"
