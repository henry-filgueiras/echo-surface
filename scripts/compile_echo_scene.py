#!/usr/bin/env python3
"""Compile an EchoSurface scene JSON into a Resonant Lab garden config YAML.

See `echo_adapter_v0.md` at the repo root for the canonical spec.

The compiler is intentionally narrow:

  * shapes           -> small local oscillator clusters (one node per polygon corner)
  * shape.kind       -> cluster cardinality + base frequency family
  * shape.weight     -> mild scale on global K0
  * contours         -> scheduled per-node nudge events targeting the anchor shape
  * tides            -> accepted in input schema, deferred in v0

Output:

  * a valid garden config YAML (validated against sim.config.validate)
  * a provenance JSON sidecar mapping EchoSurface primitives to generated
    nodes and scheduled events
  * follow-up commands printed to stdout so the user can run the baseline
    simulation and build the intervention atlas.

Usage:

    python scripts/compile_echo_scene.py \
        --scene examples/echo/two_squares_one_contour.json \
        --out configs/generated/echo_two_squares.yaml \
        --provenance configs/generated/echo_two_squares.provenance.json
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
LAB_ROOT = REPO_ROOT / "lab" / "resonant-instrument-lab"
sys.path.insert(0, str(LAB_ROOT))

from sim.config import ConfigError, validate  # noqa: E402

PROVENANCE_SCHEMA_VERSION = 1

# Canonical kind -> (corner count, base frequency Hz, symmetric offset template).
# Templates are in Hz, added to the base. Keep these exactly as written in
# echo_adapter_v0.md — they are the v0 contract, not a knob.
KIND_TABLE = {
    "triangle": (3, 3.0, [-0.10, 0.00, +0.10]),
    "square":   (4, 2.0, [-0.15, -0.05, +0.05, +0.15]),
    "pentagon": (5, 2.5, [-0.16, -0.08, 0.00, +0.08, +0.16]),
    "hexagon":  (6, 3.0, [-0.20, -0.12, -0.04, +0.04, +0.12, +0.20]),
}

# Coupling / run defaults from the spec. K0 is scaled mildly by mean weight.
SIGMA_DEFAULT = 0.18
ETA_DEFAULT = 0.0
DURATION_S_DEFAULT = 12.0
CONTROL_RATE_HZ_DEFAULT = 200
AUDIO_RATE_HZ_DEFAULT = 22050
SEED_DEFAULT = 42
GAMMA_DEFAULT = 0.10  # spec suggests 1.0 "e.g."; 0.10 matches every validated
                     # reference fixture and reliably produces a non-trivial
                     # regime — documented in the provenance sidecar.

# Contour compilation
CONTOUR_FIRST_EVENT_S = 4.0
CONTOUR_EVENT_STRIDE_S = 1.0
CONTOUR_TARGET_POLICY = "all_nodes_from_anchor_shape"


class SceneError(ValueError):
    """Raised when an echo_scene.json violates the v0 input schema."""


def _check(cond, msg):
    if not cond:
        raise SceneError(msg)


def _read_scene(path: Path) -> dict:
    try:
        doc = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        raise SceneError(f"{path}: invalid JSON: {e}") from e
    _check(isinstance(doc, dict), f"{path}: top-level must be an object")
    _check(doc.get("schema_version") == 1,
           f"{path}: schema_version must be 1 (got {doc.get('schema_version')!r})")
    for key in ("shapes", "contours"):
        _check(isinstance(doc.get(key, []), list),
               f"{path}: '{key}' must be a list")
    return doc


def _scene_name(scene: dict, out_path: Path) -> str:
    name = scene.get("name")
    if isinstance(name, str) and name:
        return name
    return out_path.stem


def _round(x: float, ndigits: int = 6) -> float:
    """Round-to-precision so the emitted YAML/JSON is stable across runs."""
    if not math.isfinite(x):
        raise SceneError(f"non-finite number in scene: {x!r}")
    return round(float(x), ndigits)


def _clamp_unit(v: float) -> float:
    return max(0.0, min(1.0, v))


def _compile_shape(shape: dict, node_index_start: int) -> tuple[list[dict], dict]:
    """Return (nodes, per_shape_meta) starting node indices at node_index_start."""
    sid = shape.get("id")
    _check(isinstance(sid, str) and sid, f"shape missing string 'id': {shape!r}")
    kind = shape.get("kind")
    _check(kind in KIND_TABLE,
           f"shape {sid}: kind must be one of {sorted(KIND_TABLE)}, got {kind!r}")
    center = shape.get("center")
    _check(isinstance(center, list) and len(center) == 2
           and all(isinstance(c, (int, float)) for c in center),
           f"shape {sid}: center must be [x, y] floats")
    radius = shape.get("radius")
    _check(isinstance(radius, (int, float)) and radius > 0,
           f"shape {sid}: radius must be positive")
    weight = shape.get("weight", 1.0)
    _check(isinstance(weight, (int, float)), f"shape {sid}: weight must be number")
    rotation_deg = shape.get("rotation_deg", 0.0)
    _check(isinstance(rotation_deg, (int, float)),
           f"shape {sid}: rotation_deg must be number")

    k, base_hz, offsets = KIND_TABLE[kind]
    theta0 = math.radians(float(rotation_deg))
    cx, cy = float(center[0]), float(center[1])
    r = float(radius)

    nodes = []
    for i in range(k):
        theta = theta0 + 2.0 * math.pi * i / k
        x = _clamp_unit(cx + r * math.cos(theta))
        y = _clamp_unit(cy + r * math.sin(theta))
        omega = base_hz + offsets[i]
        # nudge slightly if weight != 1.0 so a scene's weight is visible
        # in per-node omega, but keep it tiny to avoid cross-family bleed.
        omega += 0.0  # reserved: keep weight out of omega in v0 (spec: weight -> coupling)
        node_global_index = node_index_start + i
        nodes.append({
            "pos": [_round(x), _round(y)],
            "omega_0_hz": _round(omega, 4),
            "gamma": GAMMA_DEFAULT,
            "voice": node_global_index % 8,  # cyclic; VOICE_PALETTE = 8 in sim.config
        })

    meta = {
        "id": sid,
        "kind": kind,
        "center": [_round(cx), _round(cy)],
        "radius": _round(r),
        "weight": _round(float(weight)),
        "rotation_deg": _round(float(rotation_deg)),
        "base_freq_hz": base_hz,
        "offset_template_hz": offsets,
        "node_indices": list(range(node_index_start, node_index_start + k)),
    }
    return nodes, meta


def _compile_contour(contour: dict, shape_to_nodes: dict[str, list[int]],
                     event_time_s: float) -> tuple[list[dict], dict]:
    """Return (events, provenance_entry) for one contour.

    v0 policy: target *all nodes* from the anchor shape with identical
    nudge events at one shared time. This keeps the contour's effect
    highly visible in the resulting regime.
    """
    cid = contour.get("id")
    _check(isinstance(cid, str) and cid,
           f"contour missing string 'id': {contour!r}")
    anchor = contour.get("anchor_shape_id")
    _check(anchor in shape_to_nodes,
           f"contour {cid}: anchor_shape_id {anchor!r} does not match any shape")
    strength = contour.get("strength", 0.0)
    _check(isinstance(strength, (int, float)),
           f"contour {cid}: strength must be a number")
    pts = contour.get("points", [])
    _check(isinstance(pts, list),
           f"contour {cid}: points must be a list")

    delta_hz = _round(0.10 + 0.20 * float(strength), 4)
    targets = list(shape_to_nodes[anchor])
    t = _round(event_time_s, 4)

    events = [
        {"t": t, "type": "nudge", "node": n, "delta_hz": delta_hz}
        for n in targets
    ]
    prov = {
        "source_contour_id": cid,
        "anchor_shape_id": anchor,
        "strength": _round(float(strength)),
        "point_count": len(pts),
        "compiled_events": [
            {
                "kind": "nudge",
                "target_nodes": targets,
                "time_s": t,
                "delta_hz": delta_hz,
            }
        ],
    }
    return events, prov


def compile_scene(scene: dict, scene_name: str) -> tuple[dict, dict]:
    """Compile a scene dict into (garden_config_dict, provenance_dict)."""
    shapes = scene.get("shapes", [])
    _check(len(shapes) >= 1, "scene must contain at least one shape")

    nodes: list[dict] = []
    shape_meta: list[dict] = []
    shape_to_nodes: dict[str, list[int]] = {}
    shape_ids_seen: set[str] = set()
    weights: list[float] = []
    for shape in shapes:
        sid = shape.get("id", "<missing>")
        _check(sid not in shape_ids_seen, f"duplicate shape id: {sid!r}")
        shape_ids_seen.add(sid)
        cluster_nodes, meta = _compile_shape(shape, node_index_start=len(nodes))
        nodes.extend(cluster_nodes)
        shape_meta.append(meta)
        shape_to_nodes[meta["id"]] = meta["node_indices"]
        weights.append(meta["weight"])

    _check(len(nodes) >= 2,
           "scene must produce at least 2 nodes (sim.config requires N >= 2)")

    # Coupling: K0 = 0.8 + 0.4 * mean(weight). One clear formula, documented.
    mean_weight = sum(weights) / len(weights)
    K0 = _round(0.8 + 0.4 * mean_weight, 4)

    # Events from contours — one deterministic time per contour, spec §contour.
    events: list[dict] = []
    contour_prov: list[dict] = []
    contours = scene.get("contours", [])
    for i, contour in enumerate(contours):
        t = CONTOUR_FIRST_EVENT_S + i * CONTOUR_EVENT_STRIDE_S
        ev, prov = _compile_contour(contour, shape_to_nodes, t)
        events.extend(ev)
        contour_prov.append(prov)

    # Events must be sorted by t — they already are because i monotonic.

    cfg = {
        "version": 1,
        "meta": {
            "name": scene_name,
            "notes": (
                "Auto-generated from EchoSurface scene by "
                "scripts/compile_echo_scene.py (echo_adapter_v0). "
                "Shapes -> local oscillator clusters; contours -> scheduled "
                "nudge events. Provenance sidecar emitted alongside this YAML."
            ),
        },
        "scene": {
            "N": len(nodes),
            "nodes": nodes,
            "coupling": {"K0": K0, "sigma": SIGMA_DEFAULT},
            "noise": {"eta": ETA_DEFAULT},
        },
        "run": {
            "duration_s": DURATION_S_DEFAULT,
            "control_rate_hz": CONTROL_RATE_HZ_DEFAULT,
            "audio_rate_hz": AUDIO_RATE_HZ_DEFAULT,
            "seed": SEED_DEFAULT,
        },
    }
    if events:
        cfg["events"] = events

    tides = scene.get("tides", []) or []
    provenance = {
        "schema_version": PROVENANCE_SCHEMA_VERSION,
        "scene_name": scene_name,
        "shape_to_nodes": shape_to_nodes,
        "shapes": shape_meta,
        "contours": contour_prov,
        "tides": {
            "deferred_in_v0": True,
            "input_count": len(tides),
        },
        "mapping": {
            "target_policy": CONTOUR_TARGET_POLICY,
            "kind_table": {
                k: {"cardinality": v[0], "base_freq_hz": v[1], "offsets_hz": v[2]}
                for k, v in KIND_TABLE.items()
            },
            "gamma_default": GAMMA_DEFAULT,
            "coupling": {
                "K0_formula": "0.8 + 0.4 * mean(shape.weight)",
                "K0_resolved": K0,
                "sigma": SIGMA_DEFAULT,
            },
            "noise_eta": ETA_DEFAULT,
            "run": {
                "duration_s": DURATION_S_DEFAULT,
                "control_rate_hz": CONTROL_RATE_HZ_DEFAULT,
                "audio_rate_hz": AUDIO_RATE_HZ_DEFAULT,
                "seed": SEED_DEFAULT,
            },
            "contour_event_schedule": {
                "first_event_s": CONTOUR_FIRST_EVENT_S,
                "stride_s": CONTOUR_EVENT_STRIDE_S,
                "delta_hz_formula": "0.10 + 0.20 * strength",
            },
        },
        "notes": [
            "Shapes compiled to local oscillator clusters — one node per polygon corner.",
            "Contours compiled to scheduled per-node 'nudge' events targeting "
            "all nodes of the anchor shape. Contours are NOT melodies.",
            "Tides accepted in input schema but deferred in v0.",
            "gamma=0.10 matches validated reference fixtures; the adapter spec "
            "suggested 1.0 as an example only.",
        ],
    }
    return cfg, provenance


def _emit_yaml(cfg: dict, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        yaml.safe_dump(cfg, f, sort_keys=False, default_flow_style=None)


def _emit_json(obj: dict, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        json.dump(obj, f, indent=2, sort_keys=True, allow_nan=False)
        f.write("\n")


def _print_follow_up(config_path: Path, scene_name: str) -> None:
    rel_cfg = _repo_rel(config_path)
    run_dir = f"runs/generated/{scene_name}"
    lab_cfg = f"../../{rel_cfg}" if not rel_cfg.startswith("lab/") else rel_cfg
    lab_out = f"../../{run_dir}"
    print()
    print("next steps — run the baseline and build the atlas:")
    print()
    print(f"  cd {LAB_ROOT.relative_to(REPO_ROOT)}")
    print(f"  .venv/bin/python scripts/run_sim.py \\")
    print(f"      --config {lab_cfg} \\")
    print(f"      --out {lab_out} \\")
    print(f"      --summary --summary-json")
    print()
    print(f"  .venv/bin/python scripts/build_atlas.py \\")
    print(f"      --config {lab_cfg} \\")
    print(f"      --baseline-dir {lab_out}")
    print()


def _repo_rel(p: Path) -> str:
    try:
        return str(p.resolve().relative_to(REPO_ROOT))
    except ValueError:
        return str(p)


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Compile an EchoSurface scene into a Resonant Lab garden config."
    )
    ap.add_argument("--scene", required=True, type=Path,
                    help="path to echo_scene.json")
    ap.add_argument("--out", required=True, type=Path,
                    help="path to write the generated garden YAML config")
    ap.add_argument("--provenance", required=True, type=Path,
                    help="path to write the provenance JSON sidecar")
    ap.add_argument("--quiet", action="store_true",
                    help="suppress the follow-up command hint")
    args = ap.parse_args()

    scene_path: Path = args.scene
    if not scene_path.is_file():
        print(f"error: scene file not found: {scene_path}", file=sys.stderr)
        return 2

    try:
        scene = _read_scene(scene_path)
        scene_name = _scene_name(scene, args.out)
        cfg, provenance = compile_scene(scene, scene_name)
        validate(cfg)
    except (SceneError, ConfigError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    provenance["source_scene_path"] = _repo_rel(scene_path)
    provenance["generated_config_path"] = _repo_rel(args.out)
    provenance["provenance_path"] = _repo_rel(args.provenance)

    _emit_yaml(cfg, args.out)
    _emit_json(provenance, args.provenance)

    print(f"ok: wrote {args.out} ({cfg['scene']['N']} nodes, "
          f"{len(cfg.get('events', []))} events)")
    print(f"ok: wrote {args.provenance}")
    if not args.quiet:
        _print_follow_up(args.out, scene_name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
