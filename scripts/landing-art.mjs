#!/usr/bin/env node
// Generates the landing page's authored artwork in public/art/ and its
// provenance manifest public/art/sources.json.
//
//   node scripts/landing-art.mjs
//
// Every piece is an original SVG composition in the fluid palette (signal
// #00804D, fluid #0D6A3D / #008A52, mint #3DDC97) on a transparent ground,
// rasterised with sharp (bundled with Next) to AVIF with a WebP fallback at
// explicit dimensions. No third-party or Katana material is used. Re-running
// the script reproduces the files; the manifest records each file's hash.

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public/art");

const DEEP = "#0D6A3D";
const MID = "#008A52";
const SIGNAL = "#00804D";
const MINT = "#3DDC97";

// A Gaussian blur whose filter region covers the whole canvas plus a margin,
// so soft shapes are never clipped to their own bounding box.
function blur(id, deviation, width, height) {
  const margin = deviation * 4;
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${-margin}" y="${-margin}" width="${width + margin * 2}" height="${height + margin * 2}"><feGaussianBlur stdDeviation="${deviation}"/></filter>`;
}

// A soft elliptical glow: a radial gradient that falls smoothly to nothing at
// the ellipse's edge. Large blurs are capped by some SVG renderers, which
// leaves visible rims; a gradient never does.
function glow(id, cx, cy, rx, ry, color, opacity) {
  return {
    def: `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="0.45" stop-color="${color}" stop-opacity="${(opacity * 0.6).toFixed(3)}"/><stop offset="0.75" stop-color="${color}" stop-opacity="${(opacity * 0.22).toFixed(3)}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`,
    shape: `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id})"/>`,
  };
}

function glows(list) {
  return { defs: list.map((g) => g.def).join(""), body: list.map((g) => g.shape).join("") };
}

function svg(width, height, defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}</defs>${body}</svg>`;
}

const PIECES = [
  {
    id: "hero-glow",
    name: "Hero fallback glow",
    use: "Static hero background under the fluid; the no-WebGL, reduced-motion and Data Saver fallback",
    width: 1600,
    height: 900,
    // Soft clouds low and to the sides, darkest behind the centred copy, the
    // way the fluid sits at rest.
    build: (w, h) => {
      const g = glows([
        glow("h1", 800, 900, 1100, 420, DEEP, 0.85),
        glow("h2", 220, 680, 560, 420, MID, 0.45),
        glow("h3", 1400, 620, 560, 440, DEEP, 0.7),
        glow("h4", 1200, 120, 460, 260, DEEP, 0.35),
        glow("h5", 1020, 800, 380, 160, MINT, 0.14),
        glow("h6", 420, 860, 360, 140, MID, 0.4),
      ]);
      return svg(w, h, g.defs, g.body);
    },
  },
  {
    id: "light-beam",
    name: "How-it-works light beam",
    use: "Diagonal beam behind the How it works section; the only parallax target",
    width: 1600,
    height: 900,
    build: (w, h) =>
      svg(
        w,
        h,
        `<linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="${MID}" stop-opacity="0"/>
          <stop offset="0.45" stop-color="${MID}" stop-opacity="0.34"/>
          <stop offset="0.7" stop-color="${DEEP}" stop-opacity="0.28"/>
          <stop offset="1" stop-color="${DEEP}" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="core" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.15" stop-color="${MINT}" stop-opacity="0"/>
          <stop offset="0.5" stop-color="${MINT}" stop-opacity="0.12"/>
          <stop offset="0.85" stop-color="${MINT}" stop-opacity="0"/>
        </linearGradient>` +
          blur("wide", 46, w, h) +
          blur("thin", 12, w, h),
        `<g transform="rotate(-22 800 450)">
          <ellipse cx="800" cy="450" rx="1000" ry="120" fill="url(#beam)" filter="url(#wide)"/>
          <ellipse cx="820" cy="450" rx="760" ry="16" fill="url(#core)" filter="url(#thin)"/>
        </g>`,
      ),
  },
  {
    id: "safeguard-streaks",
    name: "Safeguard light streaks",
    use: "Diagonal streaks in the top-right of each safeguard stat card",
    width: 1200,
    height: 800,
    build: (w, h) => {
      const streaks = [
        { x: 1260, y: -60, length: 980, width: 10, opacity: 0.5, blurId: "s2", color: MINT },
        { x: 1180, y: -120, length: 860, width: 26, opacity: 0.32, blurId: "s3", color: MID },
        { x: 1320, y: 120, length: 760, width: 6, opacity: 0.4, blurId: "s1", color: MINT },
        { x: 1080, y: -40, length: 640, width: 44, opacity: 0.2, blurId: "s3", color: SIGNAL },
        { x: 1300, y: 300, length: 600, width: 18, opacity: 0.24, blurId: "s2", color: MID },
      ];
      return svg(
        w,
        h,
        // Brightest where each streak enters at the top-right edge, fading
        // out towards the card's centre.
        `<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#fff" stop-opacity="1"/>
          <stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </linearGradient>
        <mask id="fadeMask" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#fade)"/></mask>` +
          blur("s1", 3, w, h) +
          blur("s2", 7, w, h) +
          blur("s3", 16, w, h),
        streaks
          .map(
            (s) =>
              `<g transform="translate(${s.x} ${s.y}) rotate(145)"><rect x="0" y="${-s.width / 2}" width="${s.length}" height="${s.width}" rx="${s.width / 2}" fill="${s.color}" opacity="${s.opacity}" filter="url(#${s.blurId})" mask="url(#fadeMask)"/></g>`,
          )
          .join(""),
      );
    },
  },
  {
    id: "join-beams",
    name: "Join panel light beams",
    use: "Converging beams behind the closing join panel",
    width: 1200,
    height: 800,
    build: (w, h) => {
      const focus = { x: 600, y: 860 };
      const sources = [
        { x: -160, y: -120, spread: 70, opacity: 0.3 },
        { x: 180, y: -200, spread: 46, opacity: 0.22 },
        { x: 600, y: -260, spread: 40, opacity: 0.14 },
        { x: 1020, y: -200, spread: 46, opacity: 0.22 },
        { x: 1360, y: -120, spread: 70, opacity: 0.3 },
      ];
      const pool = glows([
        glow("p1", 600, 820, 760, 260, DEEP, 0.85),
        glow("p2", 600, 830, 380, 130, MID, 0.5),
      ]);
      const beams = sources
        .map((s) => {
          const dx = focus.x - s.x;
          const dy = focus.y - s.y;
          const length = Math.hypot(dx, dy);
          const nx = (-dy / length) * s.spread;
          const ny = (dx / length) * s.spread;
          return `<polygon points="${s.x + nx},${s.y + ny} ${s.x - nx},${s.y - ny} ${focus.x},${focus.y}" fill="url(#beamFade)" opacity="${s.opacity}" filter="url(#j1)"/>`;
        })
        .join("");
      return svg(
        w,
        h,
        `<linearGradient id="beamFade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${h}">
          <stop offset="0" stop-color="${MID}" stop-opacity="0.15"/>
          <stop offset="1" stop-color="${MINT}" stop-opacity="0.9"/>
        </linearGradient>` +
          blur("j1", 22, w, h) + pool.defs,
        `${beams}${pool.body}`,
      );
    },
  },
  {
    id: "footer-glow",
    name: "Footer logo glow",
    use: "Static radial glow behind the footer grain mark",
    width: 1600,
    height: 600,
    build: (w, h) => {
      const g = glows([
        glow("f1", 800, 360, 900, 300, DEEP, 0.85),
        glow("f2", 800, 380, 480, 160, MID, 0.5),
      ]);
      return svg(w, h, g.defs, g.body);
    },
  },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

const manifest = [];
for (const piece of PIECES) {
  const source = Buffer.from(piece.build(piece.width, piece.height));
  const avif = await sharp(source).avif({ quality: 60, effort: 6 }).toBuffer();
  const webp = await sharp(source).webp({ quality: 84, alphaQuality: 90 }).toBuffer();
  const meta = await sharp(webp).metadata();
  if (meta.width !== piece.width || meta.height !== piece.height) {
    throw new Error(`${piece.id}: rendered ${meta.width}x${meta.height}, expected ${piece.width}x${piece.height}`);
  }
  writeFileSync(path.join(outDir, `${piece.id}.avif`), avif);
  writeFileSync(path.join(outDir, `${piece.id}.webp`), webp);
  manifest.push({
    id: piece.id,
    name: piece.name,
    use: piece.use,
    src: `/art/${piece.id}.avif`,
    fallback: `/art/${piece.id}.webp`,
    origin:
      "Original SVG composition generated by scripts/landing-art.mjs (the piece's build function is its source), rasterised with sharp. No third-party material.",
    palette: [DEEP, MID, SIGNAL, MINT],
    width: piece.width,
    height: piece.height,
    formats: {
      avif: { contentType: "image/avif", sha256: sha256(avif), bytes: avif.length },
      webp: { contentType: "image/webp", sha256: sha256(webp), bytes: webp.length },
    },
    authoredOn: "2026-11-18",
  });
  console.log(`${piece.id}: ${piece.width}x${piece.height}, avif ${avif.length} B, webp ${webp.length} B`);
}

writeFileSync(path.join(outDir, "sources.json"), `${JSON.stringify(manifest, null, 2)}\n`);
