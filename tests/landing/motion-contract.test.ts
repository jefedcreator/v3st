import { describe, expect, it } from "vitest";

import {
  HERO_FADE_INTERVALS,
  HERO_INTRO_INTERVALS,
  HERO_INTRO_TOTAL_MS,
  heroFrame,
  heroProgress,
  smoothProgress,
  smoothstep,
  TICKER_SECONDS_PER_ROW,
  type HeroGroup,
} from "@/components/landing/motion-contract";

const GROUPS: readonly HeroGroup[] = [
  "background",
  "heading",
  "copy",
  "actions",
  "rail",
];

describe("smoothstep", () => {
  it("clamps and smooths", () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 10);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(2)).toBe(1);
  });
});

describe("heroFrame", () => {
  it("yields all five hero opacities at 1 for a full intro at progress 0", () => {
    const frame = heroFrame({ elapsedMs: HERO_INTRO_TOTAL_MS, progress: 0 });
    for (const group of GROUPS) {
      expect(frame[group]).toBe(1);
    }
    expect(frame.navReveal).toBe(1);
    expect(frame.ctaReveal).toBe(0);
  });

  it("starts every group at 0 at elapsed 0", () => {
    const frame = heroFrame({ elapsedMs: 0, progress: 0 });
    for (const group of GROUPS) {
      expect(frame[group]).toBe(0);
    }
    expect(frame.navReveal).toBe(0);
  });

  it("follows the exact intro intervals at intermediate times", () => {
    const at = (ms: number) => heroFrame({ elapsedMs: ms, progress: 0 });
    expect(at(200).heading).toBe(0);
    expect(at(550).heading).toBeGreaterThan(0);
    expect(at(550).heading).toBeLessThan(1);
    expect(at(900).heading).toBe(1);
    expect(at(480).copy).toBe(0);
    expect(at(830).copy).toBeGreaterThan(0);
    expect(at(1180).copy).toBe(1);
    expect(at(760).actions).toBe(0);
    expect(at(1110).actions).toBeGreaterThan(0);
    expect(at(1460).actions).toBe(1);
    expect(at(1040).rail).toBe(0);
    expect(at(1390).rail).toBeGreaterThan(0);
    expect(at(1740).rail).toBe(1);
    expect(at(900).background).toBe(1);
    expect(at(0).background).toBe(0);
  });

  it("hides the hero and reveals the header CTA at progress 1", () => {
    const frame = heroFrame({ elapsedMs: HERO_INTRO_TOTAL_MS, progress: 1 });
    for (const group of GROUPS) {
      expect(frame[group]).toBe(0);
    }
    expect(frame.ctaReveal).toBe(1);
  });

  it("restores visibility when progress decreases", () => {
    const full = heroFrame({ elapsedMs: HERO_INTRO_TOTAL_MS, progress: 1 });
    const half = heroFrame({ elapsedMs: HERO_INTRO_TOTAL_MS, progress: 0.65 });
    const zero = heroFrame({ elapsedMs: HERO_INTRO_TOTAL_MS, progress: 0 });
    for (const group of GROUPS) {
      expect(half[group]).toBeGreaterThan(full[group]);
      expect(zero[group]).toBeGreaterThan(half[group]);
    }
  });

  it("matches the captured fade interval boundaries", () => {
    const h = (p: number) => heroFrame({ elapsedMs: HERO_INTRO_TOTAL_MS, progress: p });
    // actions fade 0..0.40 of handover: at progress 0.30 (h=0) actions still 1
    expect(h(0.3).actions).toBe(1);
    // heading fade 0.40..1: at h=0.4 heading starts fading
    const h40 = h(0.3 + 0.4 * 0.7);
    expect(h40.heading).toBeLessThan(1);
    expect(h40.heading).toBeGreaterThan(0.99);
    expect(HERO_FADE_INTERVALS.actions[1]).toBe(0.4);
    expect(HERO_INTRO_INTERVALS.rail[1]).toBe(1740);
  });
});

describe("smoothProgress", () => {
  it("is frame-rate normalized", () => {
    expect(smoothProgress(0, 1, 16.67)).toBeCloseTo(0.18, 5);
    expect(smoothProgress(0, 1, 33.34)).toBeCloseTo(1 - 0.82 ** 2, 5);
    expect(smoothProgress(0, 1, 8.335)).toBeCloseTo(1 - 0.82 ** 0.5, 5);
  });

  it("caps delta at 64ms", () => {
    expect(smoothProgress(0, 1, 1000)).toBe(smoothProgress(0, 1, 64));
  });

  it("converges toward the target", () => {
    let q = 0;
    for (let i = 0; i < 600; i += 1) q = smoothProgress(q, 1, 16.67);
    expect(q).toBeGreaterThan(0.999);
  });
});

describe("heroProgress", () => {
  it("maps the hero rect to [0,1]", () => {
    expect(heroProgress(0, 1600, 1000)).toBe(0);
    expect(heroProgress(-600, 1600, 1000)).toBe(1);
    expect(heroProgress(-300, 1600, 1000)).toBeCloseTo(0.5, 5);
    expect(heroProgress(50, 1600, 1000)).toBe(0);
    expect(heroProgress(0, 800, 1000)).toBe(0);
  });
});

describe("ticker timing", () => {
  it("scales with unique row count", () => {
    expect(6 * TICKER_SECONDS_PER_ROW).toBe(27);
    expect(7 * TICKER_SECONDS_PER_ROW).toBe(31.5);
  });
});
