import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

import { shouldRunFluid } from "@/components/landing/fluid/fluid-gate";

it("runs the fluid only when motion, data and WebGL allow it", () => {
  expect(shouldRunFluid({ reducedMotion: false, saveData: false, webgl: true })).toBe(true);
  expect(shouldRunFluid({ reducedMotion: true, saveData: false, webgl: true })).toBe(false);
  expect(shouldRunFluid({ reducedMotion: false, saveData: true, webgl: true })).toBe(false);
  expect(shouldRunFluid({ reducedMotion: false, saveData: false, webgl: false })).toBe(false);
});

it("keeps the vendored source pinned and licensed", () => {
  const src = readFileSync("src/components/landing/fluid/liquid-ether.tsx", "utf8");
  expect(src).toContain("1eeb6f105c68b964289d85dabbe84a1d551f3797");
  expect(src).toContain("dissipation");
  expect(readFileSync("src/components/landing/fluid/LICENSE-react-bits.md", "utf8")).toContain(
    "Commons Clause",
  );
});
