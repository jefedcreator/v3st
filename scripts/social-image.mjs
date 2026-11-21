/**
 * Renders the 1200×630 social image, src/app/opengraph-image.png: the V3ST
 * lockup (the mint grain beside "V3ST" in Archivo 700, set as the Logo
 * component sets it in src/components/logo.tsx), the headline in Archivo at
 * weight 300, and the beta line, on the void ground with the flag-green glow.
 * No third-party marks or figures.
 *
 *   node scripts/social-image.mjs
 *
 * Archivo comes from Google Fonts at generation time only; the site itself
 * loads it through next/font. Set LANDING_CHROMIUM_PATH to use a specific
 * Chromium (as the landing browser suite does).
 */
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const root = new URL("../", import.meta.url);
const grain = readFileSync(new URL("docs/brand/v3st-grain.svg", root), "utf8")
  .replace(/<title>.*?<\/title>/, "")
  .replace(' role="img"', ' aria-hidden="true"')
  .replace('fill="#00804D"', 'fill="#3DDC97"');

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@300;500;700&display=block">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body {
    background: radial-gradient(ellipse 640px 400px at 50% 70%, rgba(0, 128, 77, 0.55), rgba(0, 128, 77, 0) 75%), #020604;
    color: #FFFFFF; font-family: "Archivo", sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 30px;
  }
  .lockup { display: flex; align-items: center; gap: 0.32em; font-size: 66px; font-weight: 700; line-height: 1; letter-spacing: -0.03em; }
  .lockup svg { height: 1.35em; width: auto; display: block; flex: none; }
  h1 { margin: 0; font-weight: 300; font-size: 92px; line-height: 1; letter-spacing: -0.024em; }
  p { margin: 6px 0 0; font-weight: 500; font-size: 21px; letter-spacing: 0.18em; text-transform: uppercase; color: #3DDC97; }
</style></head>
<body>
  <div class="lockup">${grain}V3ST</div>
  <h1>Invest. Earn. Harvest.</h1>
  <p>Beta · test money only</p>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.LANDING_CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() =>
    ["300", "700"].every((weight) =>
      [...document.fonts].some((font) => font.family === "Archivo" && font.weight === weight && font.status === "loaded"),
    ),
  );
  if (!loaded) throw new Error("Archivo did not load; refusing to render with a fallback face");
  const out = new URL("src/app/opengraph-image.png", root);
  await page.screenshot({ path: out.pathname, type: "png" });
  console.log(`social image written to ${out.pathname}`);
} finally {
  await browser.close();
}
