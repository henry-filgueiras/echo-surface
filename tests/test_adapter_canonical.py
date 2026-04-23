#!/usr/bin/env python3
"""Regression + canonization tests for the EchoSurface → Resonant Lab
adapter's canonical `two_squares_one_contour` example.

These tests lock in the *shape* of the story, not brittle numerics:

    The two squares phase-lock, but the lock is brittle — perturbing
    a node in the contour-anchored left square cleanly breaks it.

So the assertions below care about:

  * the compiler is deterministic and its output validates via the lab
  * the configuration carries the contract the spec names (N, event
    count/kind/time, K0, sigma)
  * the provenance maps shapes to nodes correctly
  * the baseline detector matrix matches the readable set
    (phase_locked + brittle_lock fired; six other detectors silent)
  * the atlas keeps the left-cluster-brittleness story visible
    (top-ranked intervention is on a contour-anchor-cluster node, and
    the top score is meaningfully separated from the bulk)

Exact float values, exact rank ordering of all 16 interventions, and
byte sizes of artifacts are not asserted — those are the brittle kind
of check the task brief explicitly warned against.

Run directly:

    lab/resonant-instrument-lab/.venv/bin/python tests/test_adapter_canonical.py

Or, if pytest is available in the active environment:

    python -m pytest tests/test_adapter_canonical.py
"""
from __future__ import annotations

import functools
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
LAB = REPO / "lab" / "resonant-instrument-lab"

# Make the adapter script and the lab submodule importable.
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(LAB))

from scripts import compile_echo_scene as cmp  # noqa: E402

from sim.config import load as lab_config_load  # noqa: E402
from sim.garden import simulate  # noqa: E402
# _build_summary / _build_atlas are the single source of truth used by
# the lab's own run_sim.py / build_atlas.py CLIs — reuse them so the
# test exercises the real runtime path, not a reimplementation.
from scripts.run_sim import _build_summary, _write_summary_json  # noqa: E402
from scripts.build_atlas import _build_atlas  # noqa: E402

SCENE = REPO / "examples" / "echo" / "two_squares_one_contour.json"
CONFIG = REPO / "configs" / "generated" / "echo_two_squares.yaml"
PROVENANCE = REPO / "configs" / "generated" / "echo_two_squares.provenance.json"

LEFT_CLUSTER_NODES = {0, 1, 2, 3}   # shape_A (contour-anchored)
RIGHT_CLUSTER_NODES = {4, 5, 6, 7}  # shape_B

EXPECTED_FIRED = {"phase_locked", "brittle_lock"}
EXPECTED_SILENT = {
    "drifting",
    "phase_beating",
    "flam",
    "polyrhythmic",
    "dominant_cluster",
    "unstable_bridge",
}

# ---------------------------------------------------------------------------
# Shared artifacts — compile once, simulate once, build atlas once.
# Atlas construction runs 16 counterfactual sims; caching halves test time.
# ---------------------------------------------------------------------------


@functools.lru_cache(maxsize=1)
def _compile_to_tmp() -> tuple[Path, Path, dict, dict]:
    """Compile the canonical scene into a tempdir and return paths + dicts.

    Isolated from the committed `configs/generated/` artifacts so the
    tests exercise the live compiler rather than a pre-baked file.
    """
    tmp = Path(tempfile.mkdtemp(prefix="adapter_canon_"))
    cfg_path = tmp / "echo_two_squares.yaml"
    prov_path = tmp / "echo_two_squares.provenance.json"
    subprocess.check_call(
        [
            sys.executable,
            str(REPO / "scripts" / "compile_echo_scene.py"),
            "--scene", str(SCENE),
            "--out", str(cfg_path),
            "--provenance", str(prov_path),
            "--quiet",
        ],
        cwd=str(REPO),
    )
    cfg = lab_config_load(cfg_path)
    prov = json.loads(prov_path.read_text())
    return cfg_path, prov_path, cfg, prov


@functools.lru_cache(maxsize=1)
def _materialize_run() -> tuple[dict, dict, Path]:
    """Simulate + build summary + build atlas for the canonical scene.

    Returns `(summary, atlas, run_dir)`. The run dir is a tempdir the
    tests can inspect; it's left on disk so subsequent cached calls
    can re-read artifacts cheaply. A trailing `_cleanup` atexit hook
    removes it.
    """
    import atexit

    cfg_path, _, cfg, _ = _compile_to_tmp()
    run_dir = Path(tempfile.mkdtemp(prefix="adapter_canon_run_"))
    atexit.register(shutil.rmtree, run_dir, ignore_errors=True)
    simulate(cfg, run_dir, config_path=str(cfg_path))
    summary = _build_summary(cfg, str(cfg_path), run_dir)
    _write_summary_json(summary, run_dir)
    atlas = _build_atlas(cfg, str(cfg_path), str(run_dir))
    return summary, atlas, run_dir


# ---------------------------------------------------------------------------
# Compiler-level tests
# ---------------------------------------------------------------------------


def test_compile_deterministic():
    """Two compiles of the same scene produce byte-identical YAML.

    The provenance sidecar records its own write path, so only the YAML
    itself is compared byte-for-byte. Determinism is a load-bearing
    property of the adapter — a future refactor that quietly inserts a
    timestamp or a randomized voice order would fail here.
    """
    tmp = Path(tempfile.mkdtemp(prefix="adapter_canon_det_"))
    try:
        a_yaml = tmp / "a.yaml"
        b_yaml = tmp / "b.yaml"
        a_prov = tmp / "a.prov.json"
        b_prov = tmp / "b.prov.json"
        for out, prov in [(a_yaml, a_prov), (b_yaml, b_prov)]:
            subprocess.check_call(
                [
                    sys.executable,
                    str(REPO / "scripts" / "compile_echo_scene.py"),
                    "--scene", str(SCENE),
                    "--out", str(out),
                    "--provenance", str(prov),
                    "--quiet",
                ],
                cwd=str(REPO),
            )
        assert a_yaml.read_bytes() == b_yaml.read_bytes(), (
            "compiler is non-deterministic: two runs produced different YAML"
        )
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("ok: compiler deterministic")


def test_config_validates_through_lab():
    """The generated YAML loads cleanly via sim.config.load.

    Uses the lab's own validator — same code path that run_sim.py runs
    through. Protects against schema drift in either project.
    """
    _, _, cfg, _ = _compile_to_tmp()
    # Basic sanity on the loaded dict — full validation is performed by
    # the load() call above; a failure there raises and fails the test.
    assert cfg["version"] == 1
    assert cfg["meta"]["name"] == "echo_two_squares"
    print("ok: generated config validates via sim.config.load")


def test_config_shape_contract():
    """Config carries the contract named in echo_adapter_v0.md.

    These are the few constants worth locking — they're the 'what the
    adapter decided' fingerprint, and they change meaning if they drift.
    The scene has two squares @ default weight=1.0, so K0 = 1.6 + 0.4
    resolves to exactly 2.0.
    """
    _, _, cfg, _ = _compile_to_tmp()
    scene = cfg["scene"]
    assert scene["N"] == 8, f"expected 8 nodes (4 per square × 2), got {scene['N']}"
    assert len(scene["nodes"]) == 8
    assert scene["coupling"]["K0"] == 2.0, (
        f"K0 should be 2.0 at default weight (formula 1.6 + 0.4·mean_weight); "
        f"got {scene['coupling']['K0']}"
    )
    assert scene["coupling"]["sigma"] == 0.22, (
        f"sigma should be 0.22 (tuned default); got {scene['coupling']['sigma']}"
    )
    assert scene["noise"]["eta"] == 0.0
    events = cfg.get("events", [])
    assert len(events) == 4, (
        f"scene has one contour anchoring a 4-node square → 4 nudge events; "
        f"got {len(events)}"
    )
    for ev in events:
        assert ev["type"] == "nudge"
        assert ev["t"] == 4.0
        assert ev["node"] in LEFT_CLUSTER_NODES, (
            f"contour targets shape_A (nodes 0–3); event targets node {ev['node']}"
        )
    # strength=0.7 → delta_hz = 0.10 + 0.20·0.7 = 0.24
    assert all(abs(ev["delta_hz"] - 0.24) < 1e-9 for ev in events)
    print("ok: config shape contract preserved "
          f"(N={scene['N']}, K0={scene['coupling']['K0']}, "
          f"sigma={scene['coupling']['sigma']}, {len(events)} events @ t=4.0)")


def test_provenance_shape_to_node_mapping():
    """Provenance correctly maps each shape to its generated node indices,
    and each contour to the anchor shape's nodes as its event target set.

    This is load-bearing: without it, the bridge is opaque. Asserting the
    structure (not just the presence of the key) catches shape drift that
    would break future UI consumers.
    """
    _, _, _, prov = _compile_to_tmp()
    assert prov["schema_version"] == 1
    shape_to_nodes = prov["shape_to_nodes"]
    assert shape_to_nodes["shape_A"] == [0, 1, 2, 3]
    assert shape_to_nodes["shape_B"] == [4, 5, 6, 7]
    # The contour's anchor is the SHAPE, and its compiled events target
    # every node of that shape — wording checked separately in
    # test_provenance_wording_is_precise.
    [contour_entry] = prov["contours"]
    assert contour_entry["anchor_shape_id"] == "shape_A"
    [compiled] = contour_entry["compiled_events"]
    assert set(compiled["target_nodes"]) == LEFT_CLUSTER_NODES
    assert prov["mapping"]["target_policy"] == "all_nodes_from_anchor_shape"
    print("ok: provenance shape_to_nodes + contour target set match spec")


def test_provenance_wording_is_precise():
    """Provenance notes must say 'all nodes of the anchor shape' rather than
    implying individual nodes are 'contour-anchored'. The adapter anchors a
    contour to a SHAPE; all four nodes of that shape are event targets.

    This test protects against legibility-copy drift where a future edit
    conflates per-shape anchoring with per-node anchoring.
    """
    _, _, _, prov = _compile_to_tmp()
    notes = " ".join(prov.get("notes", []))
    assert "all nodes of the anchor shape" in notes, (
        "provenance.notes must name the per-shape anchoring policy explicitly"
    )
    print("ok: provenance wording is precise about per-shape anchoring")


# ---------------------------------------------------------------------------
# Baseline detector story
# ---------------------------------------------------------------------------


def test_baseline_detector_matrix():
    """phase_locked + brittle_lock fire; the six noise detectors stay silent.

    This is the readability guarantee: the two-squares example is meant to
    tell a two-line story, not a seven-detector stew. Locking the matrix
    (not specific confidences) means a physics change that quietly
    reintroduces flam/drifting/phase_beating will trip this test.
    """
    summary, _, _ = _materialize_run()
    detectors = summary.get("detectors", {})
    fired = {k for k, v in detectors.items() if v.get("fired")}
    silent = {k for k, v in detectors.items() if not v.get("fired")}
    missing_fired = EXPECTED_FIRED - fired
    unexpected_fired = (fired - EXPECTED_FIRED) & EXPECTED_SILENT
    assert not missing_fired, (
        f"expected detectors not firing: {sorted(missing_fired)}; "
        f"actual fired={sorted(fired)}"
    )
    assert not unexpected_fired, (
        f"noise detectors firing again (legibility regression): "
        f"{sorted(unexpected_fired)}"
    )
    assert EXPECTED_SILENT.issubset(silent), (
        f"some expected-silent detectors missing from summary entirely: "
        f"{sorted(EXPECTED_SILENT - silent)}"
    )
    print("ok: baseline detector matrix matches the intended two-line story")


def test_baseline_phase_locked_sustained():
    """phase_locked's longest window should cover most of the run.

    The tuned baseline has phase_locked firing for ~11.5 of 12 seconds.
    We assert ≥ 8 s (~67 %) so the test tolerates minor dynamics drift
    without accepting a world that only wobbles into lock briefly.
    """
    summary, _, _ = _materialize_run()
    pl = summary["detectors"]["phase_locked"]
    assert pl["fired"]
    longest = pl["longest_window_s"]
    assert longest >= 8.0, (
        f"phase_locked window shrank to {longest:.2f}s — lock is no longer sustained"
    )
    print(f"ok: phase_locked sustained ({longest:.2f}s of 12s)")


# ---------------------------------------------------------------------------
# Atlas legibility
# ---------------------------------------------------------------------------


def test_atlas_top_is_left_cluster():
    """The single top-ranked intervention acts on a node in the
    contour-anchored left square (shape_A, nodes 0–3).

    This is the story sentence: 'perturbing a node in the contour-anchored
    left square is what breaks the lock'.
    """
    _, atlas, _ = _materialize_run()
    top = atlas["interventions"][0]
    assert top["node"] in LEFT_CLUSTER_NODES, (
        f"top intervention targets node {top['node']} (not in left cluster "
        f"{sorted(LEFT_CLUSTER_NODES)}); story regression"
    )
    print(f"ok: atlas top is {top['label']} (node {top['node']}, left cluster)")


def test_atlas_top_two_both_left_cluster():
    """Top-2 interventions both target left-cluster nodes.

    Slightly stronger than top-1 alone: if the top flips to right-cluster
    but #2 is still left, the story is wobbly. The tuned adapter has both
    of the two high-impact interventions (score > 1.0) on the left cluster.
    """
    _, atlas, _ = _materialize_run()
    top_two = atlas["interventions"][:2]
    wrong = [iv for iv in top_two if iv["node"] not in LEFT_CLUSTER_NODES]
    assert not wrong, (
        "top-2 interventions must both sit on left cluster to match the "
        f"contour-anchored-brittleness story; got: "
        f"{[iv['label'] for iv in top_two]}"
    )
    print(f"ok: top-2 both left cluster — "
          f"{[iv['label'] for iv in top_two]}")


def test_atlas_top_flips_phase_locked():
    """Top intervention specifically flips phase_locked from FIRED to silent.

    This is the causal half of the story: the contour-anchored cluster is
    where the lock is brittle, so the winning intervention should be the
    one that actually breaks the lock (not, say, one that only shifts tail r).
    """
    _, atlas, _ = _materialize_run()
    top = atlas["interventions"][0]
    flips = top["deltas"].get("flips", [])
    pl_flip = next(
        (f for f in flips if f.get("detector") == "phase_locked"),
        None,
    )
    assert pl_flip is not None, (
        f"top intervention should flip phase_locked; flips={flips}"
    )
    assert pl_flip.get("from") is True and pl_flip.get("to") is False, (
        f"top intervention should flip phase_locked FIRED → silent; "
        f"got flip={pl_flip}"
    )
    print(f"ok: atlas top breaks phase_locked ({top['label']})")


def test_atlas_top_score_separated_from_bulk():
    """The top score is meaningfully separated from the bulk.

    'Bulk' = rank-5 onward (after the interesting top-4). We require the
    top score to be at least 3× the rank-5 score. On the tuned adapter
    top=1.22 and rank-5≈0.18 (≈ 6.7× gap) — the test tolerates modest
    drift but not a collapse back into an unreadable near-tie.
    """
    _, atlas, _ = _materialize_run()
    scores = [iv["score"] for iv in atlas["interventions"]]
    assert len(scores) >= 5, "atlas should have at least 5 interventions"
    top_score = scores[0]
    bulk_score = scores[4]  # rank-5 (0-indexed: 4)
    assert top_score >= 3.0 * max(bulk_score, 1e-3), (
        f"top score {top_score:.3f} has collapsed toward the bulk "
        f"(rank-5 = {bulk_score:.3f}); legibility regression"
    )
    print(f"ok: top score {top_score:.3f} >> rank-5 {bulk_score:.3f} "
          f"({top_score / max(bulk_score, 1e-3):.1f}× gap)")


def test_atlas_top_clearly_beats_right_cluster():
    """Top-1 score clearly beats every right-cluster intervention.

    Weaker than 'top score is 3× rank-5' but narrower on the story axis:
    it's not enough for the top to be on the left cluster if a right-
    cluster intervention is nearly tied. We require the best right-
    cluster score to be at most 0.5× the top.
    """
    _, atlas, _ = _materialize_run()
    top_score = atlas["interventions"][0]["score"]
    right_scores = [iv["score"] for iv in atlas["interventions"]
                    if iv["node"] in RIGHT_CLUSTER_NODES]
    assert right_scores, "atlas should contain right-cluster interventions"
    best_right = max(right_scores)
    assert best_right <= 0.5 * top_score, (
        f"best right-cluster score {best_right:.3f} is too close to top "
        f"{top_score:.3f}; the left-cluster-brittleness story is washing out"
    )
    print(f"ok: best right-cluster score {best_right:.3f} well below "
          f"top {top_score:.3f}")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

TESTS = [
    test_compile_deterministic,
    test_config_validates_through_lab,
    test_config_shape_contract,
    test_provenance_shape_to_node_mapping,
    test_provenance_wording_is_precise,
    test_baseline_detector_matrix,
    test_baseline_phase_locked_sustained,
    test_atlas_top_is_left_cluster,
    test_atlas_top_two_both_left_cluster,
    test_atlas_top_flips_phase_locked,
    test_atlas_top_score_separated_from_bulk,
    test_atlas_top_clearly_beats_right_cluster,
]


def main() -> int:
    failed = []
    for fn in TESTS:
        try:
            fn()
        except AssertionError as e:
            failed.append((fn.__name__, str(e)))
            print(f"FAIL {fn.__name__}: {e}")
    print()
    if failed:
        print(f"{len(failed)} test(s) failed:")
        for name, msg in failed:
            print(f"  - {name}: {msg.splitlines()[0]}")
        return 1
    print(f"all {len(TESTS)} adapter-canonical tests passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
