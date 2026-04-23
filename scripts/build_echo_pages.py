#!/usr/bin/env python3
"""Assemble the committed Pages bundle for generated adapter examples.

Usage:
    python scripts/build_echo_pages.py

Two narrow jobs, in order, no subprocesses, no sim regen — sim outputs
are produced by `scripts/run_echo_pipeline.sh` upstream and live under
`runs/generated/`; this script only mirrors the browser-consumed subset
into `public/` so the existing Vite → GitHub Pages workflow can serve
them without initializing the submodule in CI.

Layout produced (everything under `public/generated/`):

  viewer/                    copy of lab/resonant-instrument-lab/demo/
                             (index.html, app.js, style.css)
  runs/<name>/               per-example browser-asset bundle copied
                             from runs/generated/<name>/ — whitelist:
                             summary.json, topology.json, atlas.json,
                             audio.wav, config.yaml, atlas_audio/*.wav
  runs/<name>/provenance.json
                             copied from configs/generated/<name>.provenance.json
                             so the landing page can link to it.
  .nojekyll                  empty sentinel (safety — Vite copies
                             public/ verbatim and GH Pages would
                             otherwise apply Jekyll rules to the tree)

`public/generated/index.html` is hand-authored and deliberately not
touched — the script owns the copied / regenerated half of the bundle
only. Rebuild path mirrors the lab's `scripts/build_pages.py`: run
`scripts/run_echo_pipeline.sh` first to produce `runs/generated/`,
then this script to refresh the committed mirror.

The committed mirror is what CI serves: `.github/workflows/deploy-pages.yml`
builds Vite on a checkout without submodules, and Vite copies `public/`
into `dist/` verbatim. No submodule at CI time, no sim rerun in CI.
"""
import shutil
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SUBMODULE = REPO / "lab" / "resonant-instrument-lab"
PUBLIC_GENERATED = REPO / "public" / "generated"

# Canonical example set. New generated examples land both in
# `runs/generated/<name>/` (via the pipeline) and in this tuple.
EXAMPLES = (
    "echo_two_squares",
)

VIEWER_FILES = ("index.html", "app.js", "style.css")

# Per-example browser-consumed whitelist. Mirrors the lab's
# build_pages.FIXTURE_FILES — state.npz / events.jsonl are not
# consumed by the viewer and are deliberately dropped.
RUN_FILES = (
    "summary.json",
    "topology.json",
    "atlas.json",
    "audio.wav",
    "config.yaml",
)
RUN_DIRS = ("atlas_audio",)


def _copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def _mirror_dir(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def mirror_viewer() -> None:
    """Copy lab/resonant-instrument-lab/demo/ → public/generated/viewer/.

    The three-file viewer is vendored because the GH Pages build
    workflow checks out without submodules. Keeping it mirrored here
    means the viewer version is pinned alongside the run artifacts it
    reads — no cross-repo version drift at serve time.
    """
    src = SUBMODULE / "demo"
    dst = PUBLIC_GENERATED / "viewer"
    if not src.is_dir():
        raise SystemExit(
            f"error: {src} missing — run "
            "`git submodule update --init --recursive` first."
        )
    dst.mkdir(parents=True, exist_ok=True)
    for fname in VIEWER_FILES:
        s = src / fname
        if not s.is_file():
            raise SystemExit(f"error: missing viewer file {s}")
        _copy_file(s, dst / fname)
    # Prune anything outside the whitelist so stale files cannot
    # accumulate across rebuilds.
    for entry in dst.iterdir():
        if entry.name not in VIEWER_FILES:
            if entry.is_dir():
                shutil.rmtree(entry)
            else:
                entry.unlink()


def mirror_example(name: str) -> None:
    """Mirror one generated example's run artifacts + provenance."""
    run_src = REPO / "runs" / "generated" / name
    prov_src = REPO / "configs" / "generated" / f"{name}.provenance.json"
    run_dst = PUBLIC_GENERATED / "runs" / name

    if not run_src.is_dir():
        raise SystemExit(
            f"error: {run_src} missing — run `scripts/run_echo_pipeline.sh "
            f"{name.removeprefix('echo_')}` (or pass --name {name}) first."
        )

    if run_dst.exists():
        shutil.rmtree(run_dst)
    run_dst.mkdir(parents=True)

    for fname in RUN_FILES:
        s = run_src / fname
        if not s.is_file():
            raise SystemExit(f"error: {name}: missing {s}")
        _copy_file(s, run_dst / fname)
    for dname in RUN_DIRS:
        s = run_src / dname
        if s.is_dir():
            _mirror_dir(s, run_dst / dname)

    if prov_src.is_file():
        _copy_file(prov_src, run_dst / "provenance.json")
    else:
        print(f"  warn: {name}: provenance missing at {prov_src} (skipping)")


def main() -> None:
    PUBLIC_GENERATED.mkdir(parents=True, exist_ok=True)

    print("mirroring viewer ...")
    mirror_viewer()

    for name in EXAMPLES:
        print(f"mirroring example {name} ...")
        mirror_example(name)

    (PUBLIC_GENERATED / ".nojekyll").write_text("")

    print()
    print(f"ok: bundle assembled under {PUBLIC_GENERATED.relative_to(REPO)}/")
    print("  landing:  public/generated/index.html  (hand-authored)")
    print("  viewer:   public/generated/viewer/index.html")
    for name in EXAMPLES:
        print(f"  runs:     public/generated/runs/{name}/")
    print()
    print("preview locally:")
    print("  npm run dev            # Vite serves public/ at /generated/")
    print("  or: (cd public/generated && python -m http.server 8002)")


if __name__ == "__main__":
    main()
