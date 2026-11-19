import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

import sharp from "sharp";
import { expect, it } from "vitest";

type ArtEntry = {
  id: string;
  src: string;
  fallback: string;
  origin: string;
  width: number;
  height: number;
  formats: Record<"avif" | "webp", { contentType: string; sha256: string }>;
};

const manifest = JSON.parse(readFileSync("public/art/sources.json", "utf8")) as ArtEntry[];

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

it("records every shipped raster with its generator and hash", () => {
  const shipped = readdirSync("public/art").filter((name) => name !== "sources.json").sort();
  const recorded = manifest.flatMap((e) => [e.src, e.fallback]).map((src) => src.replace("/art/", "")).sort();
  expect(shipped).toEqual(recorded);
  for (const entry of manifest) {
    expect(entry.origin).toContain("scripts/landing-art.mjs");
    expect(sha256(`public${entry.src}`)).toBe(entry.formats.avif.sha256);
    expect(sha256(`public${entry.fallback}`)).toBe(entry.formats.webp.sha256);
  }
});

it("renders each piece across its whole canvas, not clipped to a corner", async () => {
  for (const entry of manifest) {
    const { data, info } = await sharp(`public${entry.fallback}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height], entry.id).toEqual([entry.width, entry.height]);
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < info.height; y += 4) {
      for (let x = 0; x < info.width; x += 4) {
        if (data[(y * info.width + x) * 4 + 3]! > 8) {
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    // The first authored set was rendered into the top-left quadrant only.
    expect(maxX, entry.id).toBeGreaterThan(info.width * 0.6);
    expect(maxY, entry.id).toBeGreaterThan(info.height * 0.6);
  }
});
