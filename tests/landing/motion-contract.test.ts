import { expect, it } from "vitest";

import {
  CURSOR,
  DIAGRAM,
  FLUID_COLORS,
  FLUID_SETTINGS,
  SHEET,
  counterDecimals,
  easeOutCubic,
  flowHandoverProgress,
  followerStep,
  heroFits,
  heroFrame,
  heroLayoutFrame,
  heroTargetProgress,
  logoMarqueeDurationSeconds,
  parallaxOffset,
  shouldPlayIntro,
  smoothProgress,
  tickerDurationSeconds,
} from "@/components/landing/motion/contract";

it("completes the intro at 1740 ms", () => {
  expect(heroFrame({ elapsedMs: 1740, progress: 0 })).toMatchObject({
    background: 1,
    heading: 1,
    copy: 1,
    actions: 1,
    rail: 1,
    headerCta: 0,
    navCue: 0,
  });
  expect(heroFrame({ elapsedMs: 0, progress: 0 })).toMatchObject({
    background: 0,
    heading: 0,
    copy: 0,
    actions: 0,
    rail: 0,
  });
  expect(heroFrame({ elapsedMs: 550, progress: 0 }).heading).toBeCloseTo(0.5, 6);
});

it("hands over in Katana's order", () => {
  const f = heroFrame({ elapsedMs: 10_000, progress: 0.65 }); // h = 0.5
  expect(f.actions).toBe(0);
  expect(f.rail).toBe(0);
  expect(f.copy).toBeCloseTo(0.2593, 4);
  expect(f.heading).toBeCloseTo(0.9259, 4);
  expect(f.background).toBeCloseTo(0.9767, 4);
  expect(heroFrame({ elapsedMs: 10_000, progress: 0.3 })).toMatchObject({
    heading: 1,
    actions: 1,
    headerCta: 0,
  });
  expect(heroFrame({ elapsedMs: 10_000, progress: 1 })).toMatchObject({
    background: 0,
    heading: 0,
    copy: 0,
    actions: 0,
    rail: 0,
    headerCta: 1,
    navCue: 1,
  });
});

it("smooths progress independent of frame rate, with a 64 ms cap", () => {
  expect(smoothProgress(0, 1, 16.67)).toBeCloseTo(0.18, 6);
  expect(smoothProgress(smoothProgress(0, 1, 8.335), 1, 8.335)).toBeCloseTo(
    smoothProgress(0, 1, 16.67),
    9,
  );
  expect(smoothProgress(0, 1, 1000)).toBe(smoothProgress(0, 1, 64));
});

it("never hands the hero over in ordinary flow (the blank-hero bug)", () => {
  // Unpinned, the track is one viewport tall: there is no pinned travel, so
  // progress is 0 at the top, not 1 (which faded the whole hero out).
  expect(heroTargetProgress({ top: 0, height: 900 }, 900)).toBe(0);
  expect(heroTargetProgress({ top: -40, height: 860 }, 900)).toBe(0);
  // In ordinary flow the groups keep their intro value at any scroll position;
  // only the header button follows the hero scrolling away.
  const scrolledAway = heroLayoutFrame({ elapsedMs: 10_000, progress: 1, fit: false });
  expect(scrolledAway).toMatchObject({ background: 1, heading: 1, copy: 1, actions: 1, rail: 1, headerCta: 1 });
  expect(heroLayoutFrame({ elapsedMs: 10_000, progress: 0, fit: false }).headerCta).toBe(0);
  // Pinned, it is exactly the full choreography.
  expect(heroLayoutFrame({ elapsedMs: 10_000, progress: 0.65, fit: true })).toEqual(
    heroFrame({ elapsedMs: 10_000, progress: 0.65 }),
  );
  // The intro still plays in ordinary flow.
  expect(heroLayoutFrame({ elapsedMs: 0, progress: 0, fit: false }).heading).toBe(0);
});

it("measures ordinary-flow progress as the hero scrolls out of view", () => {
  expect(flowHandoverProgress({ top: 0, height: 800 })).toBe(0);
  expect(flowHandoverProgress({ top: -400, height: 800 })).toBe(0.5);
  expect(flowHandoverProgress({ top: -2000, height: 800 })).toBe(1);
  expect(flowHandoverProgress({ top: 120, height: 800 })).toBe(0);
});

it("pins a laptop-height hero once its padding isn't counted twice", () => {
  // The copy measured without padding (419px) plus the rail (117px) fits a
  // 1440x740 viewport with the 190px clearance; with its 224px padding counted
  // as content too, the old check needed a viewport about 950px tall.
  expect(heroFits({ viewportHeight: 740, contentHeight: 419, railHeight: 117, reducedMotion: false })).toBe(true);
  expect(heroFits({ viewportHeight: 740, contentHeight: 643, railHeight: 117, reducedMotion: false })).toBe(false);
});

it("measures hero progress and fit", () => {
  expect(heroTargetProgress({ top: -300, height: 1600 }, 1000)).toBe(0.5);
  expect(heroTargetProgress({ top: 50, height: 1600 }, 1000)).toBe(0);
  expect(heroTargetProgress({ top: -900, height: 1600 }, 1000)).toBe(1);
  expect(
    heroFits({ viewportHeight: 900, contentHeight: 500, railHeight: 100, reducedMotion: false }),
  ).toBe(true);
  expect(
    heroFits({ viewportHeight: 700, contentHeight: 500, railHeight: 100, reducedMotion: false }),
  ).toBe(false);
  expect(
    heroFits({ viewportHeight: 2000, contentHeight: 500, railHeight: 100, reducedMotion: true }),
  ).toBe(false);
});

it("plays the intro only on a fresh, top-of-page load", () => {
  expect(shouldPlayIntro({ hydratedAtMs: 300, scrollY: 0, hash: "" })).toBe(true);
  expect(shouldPlayIntro({ hydratedAtMs: 300, scrollY: 0, hash: "#faq" })).toBe(false);
  expect(shouldPlayIntro({ hydratedAtMs: 300, scrollY: 800, hash: "" })).toBe(false);
  expect(shouldPlayIntro({ hydratedAtMs: 2500, scrollY: 0, hash: "" })).toBe(false);
});

it("pins the remaining Katana numbers", () => {
  expect(tickerDurationSeconds(8)).toBe(36);
  expect(logoMarqueeDurationSeconds(12)).toBe(42);
  expect(tickerDurationSeconds(7)).toBe(31.5);
  expect(easeOutCubic(0.5)).toBe(0.875);
  expect([counterDecimals(1.19, 2), counterDecimals(45, 0), counterDecimals(150, 0), counterDecimals(5, 0)]).toEqual([
    2, 1, 0, 2,
  ]);
  expect(parallaxOffset({ viewportHeight: 1000, sectionCenterY: 500, sectionHeight: 800 })).toBe(0);
  expect(parallaxOffset({ viewportHeight: 1000, sectionCenterY: -10_000, sectionHeight: 800 })).toBe(70);
  expect(parallaxOffset({ viewportHeight: 1000, sectionCenterY: 10_000, sectionHeight: 800 })).toBe(-70);
  expect(followerStep(0, 100, 16.67)).toBeCloseTo(20, 6);
  expect(SHEET).toEqual({ openMs: 260, closeMs: 170 });
  expect(FLUID_SETTINGS.dissipation).toBe(0.992);
  expect(FLUID_COLORS).toEqual(["#0D6A3D", "#0D6A3D", "#008A52"]);
  expect(DIAGRAM.stepMs).toBe(3600);
  expect(CURSOR.smoothing).toBe(0.2);
});
