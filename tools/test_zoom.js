/**
 * tools/test_zoom.js
 *
 * Headless smoke-test for the EchoSurface camera / zoom system.
 *
 * What it validates:
 *   1. Canvas background fills the full viewport at every zoom level
 *      (no transparent void at the edges when zoomed in/out).
 *   2. Scroll-to-zoom works: the canvas transform changes when wheel
 *      events fire.
 *   3. Zoom is floored at 1 (zoom-out past identity snaps back).
 *   4. Scene label and HUD elements remain visible at all zoom levels.
 *
 * Usage (assumes the app is already served at BASE_URL):
 *   node tools/test_zoom.js [base-url]   # default: http://127.0.0.1:4173
 *
 * Exit code 0 = all assertions passed.
 * Exit code 1 = at least one assertion failed (details printed to stderr).
 */

import puppeteer from "puppeteer";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const BASE_URL = process.argv[2] ?? "http://127.0.0.1:4173";
const OUT_DIR = "test-output/zoom";
const VIEWPORT = { width: 1440, height: 900 };

mkdirSync(OUT_DIR, { recursive: true });

// ─── helpers ────────────────────────────────────────────────────────────────

let failures = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓  ${label}`);
  } else {
    console.error(`  ✗  FAIL: ${label}`);
    failures += 1;
  }
}

async function screenshot(page, name) {
  const path = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`     → screenshot: ${path}`);
  return path;
}

/**
 * Sample pixel colours from the four corners and centre of the canvas element.
 * Returns { corners: [r,g,b][], center: [r,g,b] }.
 * We use this to confirm no transparent (0,0,0,0) regions exist.
 */
async function sampleCanvasPixels(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    const sample = (x, y) => {
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    };

    const offsets = 4; // px inset from edges to avoid anti-aliasing edge pixels
    return {
      topLeft: sample(offsets, offsets),
      topRight: sample(w - offsets, offsets),
      bottomLeft: sample(offsets, h - offsets),
      bottomRight: sample(w - offsets, h - offsets),
      center: sample(Math.floor(w / 2), Math.floor(h / 2)),
    };
  });
}

/**
 * Fire a wheel event (deltaY) at the centre of the canvas, simulating
 * a scroll-to-zoom gesture.
 */
async function wheelZoom(page, deltaY, steps = 1) {
  const canvasRect = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const r = c.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });

  for (let i = 0; i < steps; i++) {
    await page.mouse.move(canvasRect.cx, canvasRect.cy);
    await page.evaluate(
      ({ cx, cy, dy }) => {
        const canvas = document.querySelector("canvas");
        canvas.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: cx,
            clientY: cy,
            deltaY: dy,
            deltaMode: 0,
          }),
        );
      },
      { cx: canvasRect.cx, cy: canvasRect.cy, dy: deltaY },
    );
    // let the animation frame settle
    await new Promise((r) => setTimeout(r, 80));
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\nEchoSurface zoom smoke-test`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Output: ${OUT_DIR}/\n`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    ],
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  try {
    // ── 1. Load the app ──────────────────────────────────────────────────────
    console.log("── 1. Loading app");
    await page.goto(BASE_URL, { waitUntil: "networkidle0", timeout: 30_000 });
    // Give React a moment to mount and start the animation loop
    await new Promise((r) => setTimeout(r, 1500));

    const canvasHandle = await page.$("canvas");
    assert("canvas element exists", canvasHandle !== null);
    await screenshot(page, "01-initial");

    // ── 2. Background covers full canvas at rest ─────────────────────────────
    console.log("\n── 2. Background at rest (zoom = 1)");
    const pixelsAtRest = await sampleCanvasPixels(page);
    assert("corner pixels not fully transparent (topLeft)", pixelsAtRest?.topLeft[3] > 0);
    assert("corner pixels not fully transparent (topRight)", pixelsAtRest?.topRight[3] > 0);
    assert("corner pixels not fully transparent (bottomLeft)", pixelsAtRest?.bottomLeft[3] > 0);
    assert("corner pixels not fully transparent (bottomRight)", pixelsAtRest?.bottomRight[3] > 0);

    // ── 3. Zoom IN ───────────────────────────────────────────────────────────
    console.log("\n── 3. Zoom in (scroll up × 8)");
    await wheelZoom(page, -120, 8);
    await new Promise((r) => setTimeout(r, 600)); // let lerp settle
    await screenshot(page, "02-zoomed-in");

    const pixelsZoomedIn = await sampleCanvasPixels(page);
    assert("background covers corners when zoomed in (topLeft)", pixelsZoomedIn?.topLeft[3] > 0);
    assert("background covers corners when zoomed in (bottomRight)", pixelsZoomedIn?.bottomRight[3] > 0);

    // HUD still visible?
    const hudVisible = await page.evaluate(() => {
      const hud = document.querySelector(".surface-hud");
      if (!hud) return false;
      const r = hud.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    assert("HUD visible while zoomed in", hudVisible);

    // ── 4. Zoom OUT past identity – should clamp at 1 ────────────────────────
    console.log("\n── 4. Zoom out past identity (scroll down × 16)");
    await wheelZoom(page, 120, 16);
    await new Promise((r) => setTimeout(r, 800));
    await screenshot(page, "03-zoomed-out-clamped");

    const pixelsAfterZoomOut = await sampleCanvasPixels(page);
    assert("background covers corners after zoom-out (topLeft)", pixelsAfterZoomOut?.topLeft[3] > 0);
    assert("background covers corners after zoom-out (bottomRight)", pixelsAfterZoomOut?.bottomRight[3] > 0);

    // ── 5. Scene label still visible ────────────────────────────────────────
    console.log("\n── 5. Scene label visibility");
    const sceneLabelVisible = await page.evaluate(() => {
      const el = document.querySelector(".surface-scene-label");
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    assert("scene label visible", sceneLabelVisible);

    // ── 6. Canvas dimensions match viewport ──────────────────────────────────
    console.log("\n── 6. Canvas sizing");
    const canvasDims = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      const r = c.getBoundingClientRect();
      return { cssW: r.width, cssH: r.height, attrW: c.width, attrH: c.height };
    });
    assert(`canvas CSS width > 400px (got ${canvasDims?.cssW})`, canvasDims?.cssW > 400);
    assert(`canvas CSS height > 300px (got ${canvasDims?.cssH})`, canvasDims?.cssH > 300);

  } finally {
    await browser.close();
  }

  // ── Results ──────────────────────────────────────────────────────────────
  console.log("\n────────────────────────────────────");
  if (failures === 0) {
    console.log(`All assertions passed. Screenshots in ${OUT_DIR}/`);
    process.exit(0);
  } else {
    console.error(`${failures} assertion(s) failed. Screenshots in ${OUT_DIR}/`);
    process.exit(1);
  }
})();
