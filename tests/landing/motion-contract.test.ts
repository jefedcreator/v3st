import { describe, expect, it } from "vitest";
import {
  heroFrame,
  smoothProgress,
} from "@/components/landing/motion-contract";

describe("captured hero choreography", () => {
  it("finishes all five intro groups at 1740ms", () => {
    const frame = heroFrame({ elapsedMs: 1740, progress: 0 });
    for (const key of [
      "background",
      "heading",
      "copy",
      "actions",
      "rail",
    ] as const) {
      expect(frame[key]).toBe(1);
    }
  });
  it("uses the specified interval starts and smoothstep midpoints", () => {
    const intervals = {
      background: [0, 900],
      heading: [200, 900],
      copy: [480, 1180],
      actions: [760, 1460],
      rail: [1040, 1740],
    } as const;
    for (const key of Object.keys(intervals) as (keyof typeof intervals)[]) {
      const [start, end] = intervals[key];
      expect(heroFrame({ elapsedMs: start, progress: 0 })[key]).toBe(0);
      expect(
        heroFrame({ elapsedMs: (start + end) / 2, progress: 0 })[key],
      ).toBeCloseTo(0.5);
    }
    expect(heroFrame({ elapsedMs: 2120, progress: 0 }).navReveal).toBe(0);
    expect(heroFrame({ elapsedMs: 2570, progress: 0 }).navReveal).toBeCloseTo(
      0.5,
    );
    expect(heroFrame({ elapsedMs: 3020, progress: 0 }).navReveal).toBe(1);
  });
  it("hands over to the header and restores the hero when progress reverses", () => {
    const end = heroFrame({ elapsedMs: 5000, progress: 1 });
    for (const key of [
      "background",
      "heading",
      "copy",
      "actions",
      "rail",
    ] as const)
      expect(end[key]).toBe(0);
    expect(end.ctaReveal).toBe(1);
    const middle = heroFrame({ elapsedMs: 5000, progress: 0.6 });
    expect(middle.actions).toBeLessThan(middle.copy);
    expect(middle.copy).toBeLessThan(middle.heading);
    expect(heroFrame({ elapsedMs: 5000, progress: 0 }).heading).toBe(1);
  });
  it("normalizes smoothing by frame delta and bounds stalled frames", () => {
    const once = smoothProgress(0, 1, 33.34);
    const twice = smoothProgress(smoothProgress(0, 1, 16.67), 1, 16.67);
    expect(once).toBeCloseTo(twice, 8);
    expect(smoothProgress(0, 1, 16.67)).toBeCloseTo(0.18);
    expect(smoothProgress(0, 1, 1000)).toBe(smoothProgress(0, 1, 64));
    expect(smoothProgress(1, 0, 16.67)).toBeCloseTo(0.82);
  });
});
