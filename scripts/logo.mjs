/**
 * Draws three V3ST logo options in docs/brand/ and the grain favicon:
 *
 *   v3st-sprout.svg         Growth: a seedling breaks the ground, its two leaves opening into a V
 *   v3st-grain.svg          Harvest: an ear of grain whose kernels pair into three Vs, rising from a V of leaves
 *   v3st-crop.svg           Yield: three seedlings climb like a chart, each opening into a V
 *   v3st-logo-options.png   the three side by side: on signal green, on void, small, as an app icon and beside the wordmark
 *   src/app/icon.svg        the grain mark in mint on void
 *   v3st-lockup.png         the product lockup: the grain beside "V3ST" in Archivo 700
 *
 *   node scripts/logo.mjs
 *
 * All three share one construction on a 100-unit square: stems and ground lines
 * 8 wide (the grain's stem 7), every leaf and kernel a lens set by its tip angle,
 * and a 3.5 gap between shapes. Leaves start one gap from the stem's top corner,
 * along their own axis. The script measures every pair of shapes and refuses to
 * draw if any two come closer than 2.8, since lens tips may sit a little inside
 * the gap. Each file's viewBox is cropped to its drawing.
 *
 * The options preview keeps the former wordmark as a comparison. Chromium
 * measures the drawings and renders both previews; set LANDING_CHROMIUM_PATH
 * to use a specific one. The lockup preview loads Archivo from Google Fonts at
 * generation time and refuses to render with a fallback face.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const root = new URL("../", import.meta.url);
const out = new URL("docs/brand/", root);

const SIGNAL = "#00804D";
const MINT = "#3DDC97";
const WHITE = "#FFFFFF";
const VOID = "#020604";
const GAP = 3.5;

const round = (n) => Math.round(n * 100) / 100;
const pt = ([x, y]) => `${round(x)} ${round(y)}`;
const rad = (deg) => (deg * Math.PI) / 180;
// A point r away from p, at deg from vertical (clockwise).
const polar = ([x, y], r, deg) => [x + r * Math.sin(rad(deg)), y - r * Math.cos(rad(deg))];
const mirror = ([x, y]) => [100 - x, y];

function bar([x1, y1], [x2, y2], w) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const nx = (-(y2 - y1) / length) * (w / 2);
  const ny = ((x2 - x1) / length) * (w / 2);
  return `M${pt([x1 + nx, y1 + ny])}L${pt([x2 + nx, y2 + ny])}L${pt([x2 - nx, y2 - ny])}L${pt([x1 - nx, y1 - ny])}Z`;
}

// A lens from p1 to p2 whose two arcs meet at `tip` degrees.
function lens(p1, p2, tip) {
  const half = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2;
  const r = half / Math.sin(rad(tip) / 2);
  return `M${pt(p1)}A${round(r)} ${round(r)} 0 0 1 ${pt(p2)}A${round(r)} ${round(r)} 0 0 1 ${pt(p1)}Z`;
}

// Two leaves opening into a V from the top of a stem of width w centred on x.
function leaves(x, top, w, length, angle, tip) {
  const base = polar([x + w / 2, top], GAP, angle);
  const end = polar(base, length, angle);
  const flip = ([px, py]) => [2 * x - px, py];
  return [lens(base, end, tip), lens(flip(end), flip(base), tip)];
}

// Kernel pairs along a stem of width w, based at height y. A blunt tip's inner edge
// leaves the base heading back toward the stem and bows by r(1 − cos), so the base
// sits that much further out to keep the kernel one gap clear of the stem.
function kernels(y, w, length, angle, tip) {
  const r = length / 2 / Math.sin(rad(tip) / 2);
  const bow = tip / 2 > angle ? r * (1 - Math.cos(rad(tip / 2 - angle))) : 0;
  const base = [50 + w / 2 + GAP + bow, y];
  const end = polar(base, length, angle);
  return [lens(base, end, tip), lens(mirror(end), mirror(base), tip)];
}

const MARKS = {
  sprout: {
    title: "V3ST: a seedling breaks the ground",
    paths: () => {
      const w = 8;
      const ground = 76;
      const top = 40;
      return [bar([22, ground], [78, ground], w), bar([50, ground - w / 2 - GAP], [50, top], w), ...leaves(50, top, w, 31, 52, 90)];
    },
  },
  grain: {
    title: "V3ST: an ear of grain rising from a V of leaves",
    paths: () => {
      const w = 7;
      return [
        bar([50, 96], [50, 43], w),
        ...kernels(65.5, w, 16, 30, 90),
        ...kernels(51.5, w, 16, 30, 90),
        ...kernels(37.5, w, 14.5, 30, 90),
        lens([50, 30.5], [50, 3.5], 76),
        ...kernels(97.5, w, 32, 45, 74),
      ];
    },
  },
  crop: {
    title: "V3ST: three seedlings climb like a chart",
    paths: () => {
      const w = 8;
      const ground = 80;
      return [
        bar([11, ground], [89, ground], w),
        ...[[23, 61], [50, 48], [77, 35]].flatMap(([x, top]) => [bar([x, ground - w / 2 - GAP], [x, top], w), ...leaves(x, top, w, 15, 47, 92)]),
      ];
    },
  },
};

const wordmark = readFileSync(new URL("v3st-wordmark.svg", out), "utf8").replace("<svg ", '<svg height="38" ');

const browser = await chromium.launch({ executablePath: process.env.LANDING_CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

  // Measure each drawing: the narrowest gap between any two of its shapes, then its bounds.
  // Lens tips may sit a little inside the gap, so the floor is 80% of it.
  const drawn = {};
  for (const [name, mark] of Object.entries(MARKS)) {
    const shapes = mark.paths();
    const d = shapes.join("");
    await page.setContent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path id="m" d="${d}"/>${shapes.map((s) => `<path class="s" d="${s}"/>`).join("")}</svg>`,
    );
    const narrowest = await page.evaluate(() => {
      const outlines = [...document.querySelectorAll("path.s")].map((p) => {
        const length = p.getTotalLength();
        return Array.from({ length: 240 }, (_, i) => p.getPointAtLength((length * i) / 240));
      });
      let min = { gap: Infinity, a: -1, b: -1 };
      for (let a = 0; a < outlines.length; a++)
        for (let b = a + 1; b < outlines.length; b++)
          for (const p of outlines[a])
            for (const q of outlines[b]) {
              const gap = Math.hypot(p.x - q.x, p.y - q.y);
              if (gap < min.gap) min = { gap, a, b };
            }
      return min;
    });
    if (narrowest.gap < GAP * 0.8)
      throw new Error(`${name}: shapes ${narrowest.a} and ${narrowest.b} come within ${narrowest.gap.toFixed(2)} of each other`);
    const box = await page.evaluate(() => {
      const b = document.getElementById("m").getBBox();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    });
    console.log(`${name}: narrowest gap ${narrowest.gap.toFixed(2)}`);
    if (box.x < 0 || box.y < 0 || box.x + box.width > 100 || box.y + box.height > 100) throw new Error(`${name} leaves its 100-unit square`);
    const m = GAP / 2;
    drawn[name] = { d, title: mark.title, viewBox: [box.x - m, box.y - m, box.width + 2 * m, box.height + 2 * m].map(round).join(" ") };
  }

  mkdirSync(out, { recursive: true });
  for (const [name, { d, title, viewBox }] of Object.entries(drawn)) {
    writeFileSync(
      new URL(`v3st-${name}.svg`, out),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${title}"><title>${title}</title><path fill="${SIGNAL}" d="${d}"/></svg>\n`,
    );
  }
  const { d, viewBox } = drawn.grain;
  writeFileSync(
    new URL("src/app/icon.svg", root),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="${VOID}"/><svg x="4" y="4" width="92" height="92" viewBox="${viewBox}"><path fill="${MINT}" d="${d}"/></svg></svg>\n`,
  );

  // Preview: one column per option.
  const art = ({ d, viewBox }, fill, attrs) => `<svg viewBox="${viewBox}" ${attrs}><path fill="${fill}" d="${d}"/></svg>`;
  const icon = ({ d, viewBox }, size) => {
    const [x, y, w, h] = viewBox.split(" ").map(Number);
    const s = 70 / Math.max(w, h);
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}"><rect width="100" height="100" rx="22.5" fill="${SIGNAL}"/><path transform="translate(${round(50 - (x + w / 2) * s)} ${round(50 - (y + h / 2) * s)}) scale(${round(s)})" fill="${WHITE}" d="${d}"/></svg>`;
  };
  const column = (mark) => `<div class="col">
    <div class="tile" style="background:${SIGNAL}">${art(mark, WHITE, 'class="big"')}</div>
    <div class="tile" style="background:${VOID}">${art(mark, SIGNAL, 'class="big"')}</div>
    <div class="row">${[48, 32, 24, 16].map((s) => art(mark, MINT, `height="${s}" width="${s}"`)).join("")}</div>
    <div class="row">${[96, 48, 32].map((s) => icon(mark, s)).join("")}</div>
    <div class="row lockup">${art(mark, SIGNAL, 'height="58"')}${wordmark}</div>
  </div>`;
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; width: 1600px; background: #050B08; }
    .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; padding: 56px; }
    .col { display: flex; flex-direction: column; gap: 16px; }
    .tile { height: 300px; border-radius: 28px; display: grid; place-items: center; }
    .tile svg.big { height: 180px; max-width: 80%; }
    .row { height: 120px; border-radius: 24px; background: ${VOID}; display: flex; align-items: center; justify-content: center; gap: 28px; }
    .lockup { gap: 16px; }
  </style></head><body><div class="sheet">${Object.values(drawn).map(column).join("")}</div></body></html>`);
  await page.screenshot({ path: new URL("v3st-logo-options.png", out).pathname, fullPage: true });

  // Lockup preview: the grain beside "V3ST" in Archivo 700, set as src/components/logo.tsx sets
  // it (mark 1.35em tall, 0.32em gap, -0.03em tracking). Mint mark and white name on void, the
  // sizes the product ships, then one ink on signal green and on white.
  const lockup = (size, mark, name) =>
    `<span class="lk" style="font-size:${size}px;color:${name}">${art(drawn.grain, mark, "")}V3ST</span>`;
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@700&display=block">
    <style>
      html, body { margin: 0; width: 1600px; background: #050B08; font-family: "Archivo", sans-serif; }
      .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; padding: 56px; }
      .panel { height: 300px; border-radius: 28px; display: flex; align-items: center; justify-content: center; gap: 56px; }
      .wide { grid-column: 1 / -1; height: 380px; }
      .lk { display: inline-flex; align-items: center; gap: 0.32em; font-weight: 700; line-height: 1; letter-spacing: -0.03em; }
      .lk svg { height: 1.35em; width: auto; display: block; flex: none; }
    </style></head><body><div class="sheet">
      <div class="panel wide" style="background:${VOID}">${lockup(112, MINT, WHITE)}</div>
      <div class="panel" style="background:${VOID}">${[22, 19, 18].map((s) => lockup(s, MINT, WHITE)).join("")}</div>
      <div class="panel" style="background:${SIGNAL}">${lockup(56, WHITE, WHITE)}</div>
      <div class="panel" style="background:${WHITE}">${lockup(56, VOID, VOID)}</div>
      <div class="panel" style="background:#3DDC97">${lockup(56, VOID, VOID)}</div>
    </div></body></html>`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const archivo = await page.evaluate(() =>
    [...document.fonts].some((font) => font.family === "Archivo" && font.weight === "700" && font.status === "loaded"),
  );
  if (!archivo) throw new Error("Archivo did not load; refusing to render the lockup with a fallback face");
  await page.screenshot({ path: new URL("v3st-lockup.png", out).pathname, fullPage: true });
} finally {
  await browser.close();
}

console.log(`logo options written to ${out.pathname}`);
