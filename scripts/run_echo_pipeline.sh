#!/usr/bin/env bash
# run_echo_pipeline.sh — compile an EchoSurface scene and run it through
# the full resonant-instrument-lab pipeline (baseline sim + atlas).
#
# Idempotent: ensures the submodule is checked out, ensures its .venv
# exists with numpy + pyyaml, then compiles → simulates → builds atlas.
#
# Usage:
#   scripts/run_echo_pipeline.sh                           # default scene
#   scripts/run_echo_pipeline.sh <scene_stem>              # examples/echo/<stem>.json
#   scripts/run_echo_pipeline.sh --scene PATH [--name NAME]
#
# Default scene is examples/echo/two_squares_one_contour.json (compiled as
# `echo_two_squares`). Output paths:
#   configs/generated/<name>.yaml
#   configs/generated/<name>.provenance.json
#   runs/generated/<name>/{summary,atlas,topology}.json + state.npz + audio.wav
#
# Environment:
#   PYTHON   — python binary to bootstrap the lab's .venv (default: python3)
#
# See echo_adapter_v0.md for the spec and DIRECTORS_NOTES.md for canon.

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

LAB="lab/resonant-instrument-lab"
VENV_PY="$LAB/.venv/bin/python"

# --- 1. parse args --------------------------------------------------------
SCENE=""
NAME=""
while [ $# -gt 0 ]; do
    case "$1" in
        --scene)
            SCENE="$2"; shift 2 ;;
        --name)
            NAME="$2"; shift 2 ;;
        --help|-h)
            sed -n '2,20p' "$0"; exit 0 ;;
        --*)
            echo "error: unknown flag $1" >&2; exit 2 ;;
        *)
            # positional: treat as scene stem under examples/echo/
            if [ -z "$SCENE" ]; then
                SCENE="examples/echo/$1.json"
                shift
            else
                echo "error: unexpected positional arg $1" >&2; exit 2
            fi
            ;;
    esac
done

if [ -z "$SCENE" ]; then
    SCENE="examples/echo/two_squares_one_contour.json"
fi
if [ -z "$NAME" ]; then
    # derive from scene stem, but keep the two_squares canonical name for
    # the default scene so it matches committed proof artifacts verbatim.
    stem="$(basename "$SCENE" .json)"
    case "$stem" in
        two_squares_one_contour) NAME="echo_two_squares" ;;
        *) NAME="$stem" ;;
    esac
fi

if [ ! -f "$SCENE" ]; then
    echo "error: scene not found: $SCENE" >&2
    exit 2
fi

CONFIG="configs/generated/$NAME.yaml"
PROVENANCE="configs/generated/$NAME.provenance.json"
RUN_DIR="runs/generated/$NAME"

# --- 2. ensure submodule is populated -------------------------------------
if [ ! -f "$LAB/requirements.txt" ]; then
    echo "==> initializing resonant-instrument-lab submodule"
    git submodule update --init --recursive
fi

# --- 3. ensure lab .venv exists and has deps ------------------------------
SYS_PY="${PYTHON:-python3}"
if ! command -v "$SYS_PY" >/dev/null 2>&1; then
    echo "error: $SYS_PY not found on PATH (override with PYTHON=...)" >&2
    exit 1
fi

if [ ! -x "$VENV_PY" ]; then
    echo "==> creating $LAB/.venv via $SYS_PY -m venv"
    ( cd "$LAB" && "$SYS_PY" -m venv .venv )
fi

if ! "$VENV_PY" -c "import numpy, yaml" >/dev/null 2>&1; then
    echo "==> installing $LAB/requirements.txt into .venv"
    "$VENV_PY" -m pip install --quiet --disable-pip-version-check \
        -r "$LAB/requirements.txt"
fi

# --- 4. compile scene -----------------------------------------------------
echo "==> compiling $SCENE → $CONFIG"
"$VENV_PY" scripts/compile_echo_scene.py \
    --scene "$SCENE" \
    --out "$CONFIG" \
    --provenance "$PROVENANCE" \
    --quiet

# --- 5. run baseline simulation ------------------------------------------
echo "==> running baseline sim → $RUN_DIR"
( cd "$LAB" && .venv/bin/python scripts/run_sim.py \
    --config "../../$CONFIG" \
    --out "../../$RUN_DIR" \
    --summary --summary-json )

# --- 6. build intervention atlas -----------------------------------------
echo "==> building intervention atlas → $RUN_DIR/atlas.json"
( cd "$LAB" && .venv/bin/python scripts/build_atlas.py \
    --config "../../$CONFIG" \
    --baseline-dir "../../$RUN_DIR" )

echo
echo "done."
echo "  config:     $CONFIG"
echo "  provenance: $PROVENANCE"
echo "  summary:    $RUN_DIR/summary.json"
echo "  atlas:      $RUN_DIR/atlas.json"
