#!/usr/bin/env python3
"""Artifact-truth smoke for the committed generated-examples Pages bundle.

`public/generated/` is the outward-facing visual surface for
EchoSurface → Resonant Lab adapter examples: the hand-authored landing
page under `public/generated/index.html`, the vendored viewer under
`public/generated/viewer/`, and the per-example artifact mirror under
`public/generated/runs/<name>/` — all produced by
`scripts/build_echo_pages.py` and committed so the existing Vite →
GitHub Pages workflow can ship them without initializing the submodule
in CI.

These tests lock in the narrow guarantees a cold reader's first click
on the generated-examples page depends on:

- Landing page exists with the canonical <title>.
- Landing page carries a canonical atlas link and a canonical
  baseline-single-run link for the canonical example, verbatim.
- `public/generated/viewer/` carries the exact three-file viewer
  whitelist (matching `build_echo_pages.VIEWER_FILES`).
- `public/generated/runs/echo_two_squares/` carries every
  browser-consumed file plus provenance.json and every
  `atlas_audio/<id>.wav` is a non-silent WAV.
- `.nojekyll` sentinel is committed.
- Every local href / img src on the landing page — including viewer
  query-string parameters — resolves to a file under
  `public/generated/`.

Stdlib-only; mirrors the lab submodule's `tests/test_docs_pages.py`.

Run directly:
    python tests/test_generated_pages.py
"""
import json
import wave
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qsl, urlparse

REPO = Path(__file__).resolve().parent.parent
BUNDLE = REPO / "public" / "generated"
LANDING = BUNDLE / "index.html"

# Canonical example: the one committed today. New examples land both
# in `scripts/build_echo_pages.EXAMPLES` and here.
CANONICAL_EXAMPLE = "echo_two_squares"

# Hero links on the landing page (HTMLParser decodes &amp; → &).
CANONICAL_ATLAS_HREF = (
    f"viewer/index.html?atlas=../runs/{CANONICAL_EXAMPLE}/atlas.json"
    "&select=ablate_n1"
)
CANONICAL_BASELINE_HREF = (
    f"viewer/index.html?summaryA=../runs/{CANONICAL_EXAMPLE}/summary.json"
)

VIEWER_FILES = ("index.html", "app.js", "style.css")

# Files every per-example dir must carry. Mirrors
# build_echo_pages.RUN_FILES + the provenance.json the script also
# copies in.
RUN_REQUIRED_FILES = (
    "summary.json",
    "topology.json",
    "atlas.json",
    "audio.wav",
    "config.yaml",
    "provenance.json",
)

URL_VALUED_QUERY_KEYS = frozenset(
    {"atlas", "summaryA", "summaryB", "topologyA", "topologyB"}
)


class _LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []
        self.img_srcs: list[str] = []

    def handle_starttag(self, tag, attrs):
        attr = dict(attrs)
        if tag == "a":
            href = attr.get("href")
            if href and _is_local_url(href):
                self.hrefs.append(href)
        elif tag == "img":
            src = attr.get("src")
            if src and _is_local_url(src):
                self.img_srcs.append(src)


def _is_local_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in ("", "file") and not url.startswith("#")


def _resolve_href(base: Path, href: str) -> Path:
    parsed = urlparse(href)
    return (base / parsed.path).resolve()


def _assert_wav_has_signal(path: Path) -> None:
    """Peak absolute sample > 0 — silent-WAV regression check."""
    import numpy as np

    with wave.open(str(path), "rb") as w:
        frames = w.readframes(w.getnframes())
    arr = np.frombuffer(frames, dtype=np.int16)
    peak = int(np.abs(arr).max()) if arr.size else 0
    assert peak > 0, f"{path} is silent (peak sample = 0)"


# ---------------------------------------------------------------------------
# Landing page.


def test_landing_page_exists_and_has_title():
    assert LANDING.is_file(), f"landing page missing at {LANDING}"
    html = LANDING.read_text()
    assert (
        "<title>EchoSurface — generated adapter examples</title>" in html
    ), "landing page <title> drifted from canonical copy"
    print(f"ok: landing page — {LANDING.relative_to(REPO)} present with canonical <title>")


def test_landing_page_has_canonical_atlas_link():
    parser = _LinkCollector()
    parser.feed(LANDING.read_text())
    assert CANONICAL_ATLAS_HREF in parser.hrefs, (
        f"canonical atlas link missing. Expected: {CANONICAL_ATLAS_HREF!r}. "
        f"Got {len(parser.hrefs)} local hrefs."
    )
    print(f"ok: canonical atlas link present — {CANONICAL_ATLAS_HREF}")


def test_landing_page_has_canonical_baseline_link():
    parser = _LinkCollector()
    parser.feed(LANDING.read_text())
    assert CANONICAL_BASELINE_HREF in parser.hrefs, (
        f"canonical baseline link missing. Expected: {CANONICAL_BASELINE_HREF!r}."
    )
    print(f"ok: canonical baseline link present — {CANONICAL_BASELINE_HREF}")


def test_story_phrasing_is_precise():
    """Wording protocol (DIRECTORS_NOTES.md, 2026-04-22 canonization):
    the contour anchors a *shape*; "a node in the contour-anchored
    left square" is accurate, "a contour-anchored node" is not. Same
    rule the adapter's provenance test polices.
    """
    html = LANDING.read_text()
    assert "a node in the contour-anchored left square" in html, (
        "landing copy must use shape-anchored phrasing verbatim"
    )
    assert "a contour-anchored node" not in html, (
        "landing copy uses imprecise node-anchored phrasing — "
        "the contour anchors a shape, not individual nodes"
    )
    print("ok: story phrasing matches the shape-anchoring protocol")


# ---------------------------------------------------------------------------
# Bundle manifest — viewer + canonical example.


def test_viewer_bundle_manifest():
    viewer = BUNDLE / "viewer"
    assert viewer.is_dir(), f"viewer dir missing at {viewer}"
    present = {p.name for p in viewer.iterdir()}
    missing = set(VIEWER_FILES) - present
    assert not missing, f"viewer missing files: {sorted(missing)}"
    unexpected = present - set(VIEWER_FILES)
    assert not unexpected, (
        f"viewer has files outside the whitelist: {sorted(unexpected)} — "
        f"build_echo_pages.py should have pruned them."
    )
    print(f"ok: viewer bundle — public/generated/viewer/ exact manifest: {sorted(present)}")


def test_canonical_example_bundle_complete():
    run_dir = BUNDLE / "runs" / CANONICAL_EXAMPLE
    assert run_dir.is_dir(), f"run dir missing at {run_dir}"

    missing = [f for f in RUN_REQUIRED_FILES if not (run_dir / f).is_file()]
    assert not missing, (
        f"{CANONICAL_EXAMPLE}: required files missing: {missing}"
    )

    atlas = json.loads((run_dir / "atlas.json").read_text())
    atlas_audio_dir = run_dir / "atlas_audio"
    assert atlas_audio_dir.is_dir(), f"{CANONICAL_EXAMPLE}: atlas_audio/ missing"

    baseline_wav = run_dir / atlas["baseline"]["audio_path"]
    assert baseline_wav.is_file(), (
        f"baseline audio_path {atlas['baseline']['audio_path']!r} does not resolve"
    )
    _assert_wav_has_signal(baseline_wav)

    for iv in atlas["interventions"]:
        rel = iv["audio_path"]
        assert rel and rel.startswith("atlas_audio/"), (
            f"{iv['id']}: audio_path shape drifted — got {rel!r}"
        )
        wav = run_dir / rel
        assert wav.is_file(), f"{iv['id']}: audio_path points to missing file {wav}"
        _assert_wav_has_signal(wav)

    print(
        f"ok: run bundle — {CANONICAL_EXAMPLE}: "
        f"{len(RUN_REQUIRED_FILES)} required files + baseline wav + "
        f"{len(atlas['interventions'])} intervention WAVs all present and audible"
    )


def test_nojekyll_sentinel_present():
    sentinel = BUNDLE / ".nojekyll"
    assert sentinel.is_file(), f".nojekyll sentinel missing at {sentinel}"
    print(f"ok: .nojekyll sentinel present at {sentinel.relative_to(REPO)}")


# ---------------------------------------------------------------------------
# Link resolution — the thin browser-facing layer.


def test_landing_page_local_links_resolve_on_disk():
    """Every local href / img src — plus viewer query-string values —
    must resolve to a real file under `public/generated/`. Cross-repo
    https:// links to GitHub source files are filtered out by
    `_is_local_url`; we do not assert anything about them (verifying
    they exist would require network).
    """
    parser = _LinkCollector()
    parser.feed(LANDING.read_text())

    broken: list[tuple[str, str]] = []
    for href in parser.hrefs:
        path_target = _resolve_href(BUNDLE, href)
        # Parent-of-bundle references (e.g. the "../" link back to the
        # main app) resolve outside BUNDLE; treat as OK without reading.
        try:
            path_target.relative_to(BUNDLE)
        except ValueError:
            continue
        if not path_target.exists():
            broken.append((href, f"path {path_target} missing"))
            continue

        parsed = urlparse(href)
        if not parsed.query:
            continue
        query_base = path_target.parent
        for key, value in parse_qsl(parsed.query, keep_blank_values=True):
            if key not in URL_VALUED_QUERY_KEYS or not value:
                continue
            resolved = (query_base / value).resolve()
            if not resolved.exists():
                broken.append((href, f"?{key}={value} → {resolved} missing"))

    for src in parser.img_srcs:
        target = _resolve_href(BUNDLE, src)
        if not target.exists():
            broken.append((src, f"img src {target} missing"))

    assert not broken, (
        "landing-page links do not all resolve under public/generated/:\n  "
        + "\n  ".join(f"{h!r}: {why}" for h, why in broken)
    )
    print(
        f"ok: link resolution — {len(parser.hrefs)} hrefs + "
        f"{len(parser.img_srcs)} img srcs all resolve on disk"
    )


if __name__ == "__main__":
    test_landing_page_exists_and_has_title()
    test_landing_page_has_canonical_atlas_link()
    test_landing_page_has_canonical_baseline_link()
    test_story_phrasing_is_precise()
    test_viewer_bundle_manifest()
    test_canonical_example_bundle_complete()
    test_nojekyll_sentinel_present()
    test_landing_page_local_links_resolve_on_disk()
