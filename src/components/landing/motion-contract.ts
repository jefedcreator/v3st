export type HeroGroup = "background" | "heading" | "copy" | "actions" | "rail";

export type HeroFrame = {
  background: number;
  heading: number;
  copy: number;
  actions: number;
  rail: number;
  navReveal: number;
  ctaReveal: number;
};

export const HERO_GROUPS: readonly HeroGroup[] = [
  "background",
  "heading",
  "copy",
  "actions",
  "rail",
];

export const HERO_INTRO_INTERVALS: Record<HeroGroup, readonly [number, number]> = {
  background: [0, 900],
  heading: [200, 900],
  copy: [480, 1180],
  actions: [760, 1460],
  rail: [1040, 1740],
};

export const HERO_FADE_INTERVALS: Record<HeroGroup, readonly [number, number]> = {
  actions: [0, 0.4],
  rail: [0, 0.36],
  copy: [0.18, 0.66],
  heading: [0.4, 1],
  background: [0.45, 1],
};

export const HERO_INTRO_TOTAL_MS = 1740;
export const NAV_CUE_START_MS = 2120;
export const NAV_CUE_DURATION_MS = 900;
export const HANDOVER_START = 0.3;
export const HANDOVER_SPAN = 0.7;
export const SMOOTHING = 0.18;
export const FRAME_MS = 16.67;
export const MAX_DELTA_MS = 64;

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function smoothstep(x: number): number {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
}

export function heroFrame({
  elapsedMs,
  progress,
}: {
  elapsedMs: number;
  progress: number;
}): HeroFrame {
  const handover = smoothstep(
    (progress - HANDOVER_START) / HANDOVER_SPAN,
  );
  const introOf = (group: HeroGroup): number => {
    const [start, end] = HERO_INTRO_INTERVALS[group];
    return smoothstep((elapsedMs - start) / (end - start));
  };
  const fadeOf = (group: HeroGroup): number => {
    const [start, end] = HERO_FADE_INTERVALS[group];
    return 1 - smoothstep((handover - start) / (end - start));
  };
  return {
    background: introOf("background") * fadeOf("background"),
    heading: introOf("heading") * fadeOf("heading"),
    copy: introOf("copy") * fadeOf("copy"),
    actions: introOf("actions") * fadeOf("actions"),
    rail: introOf("rail") * fadeOf("rail"),
    navReveal: smoothstep(
      (elapsedMs - NAV_CUE_START_MS) / NAV_CUE_DURATION_MS,
    ),
    ctaReveal: handover,
  };
}

export function smoothProgress(
  current: number,
  target: number,
  deltaMs: number,
): number {
  const dt = Math.min(Math.max(deltaMs, 0), MAX_DELTA_MS);
  return (
    current + (target - current) * (1 - (1 - SMOOTHING) ** (dt / FRAME_MS))
  );
}

export function heroProgress(
  heroTop: number,
  heroHeight: number,
  viewportHeight: number,
): number {
  const scrollable = heroHeight - viewportHeight;
  if (scrollable <= 0) return 0;
  return clamp01(-heroTop / scrollable);
}

export const TICKER_SECONDS_PER_ROW = 4.5;
export const TICKER_MOBILE_VIEWPORT_REM = 22;
export const TICKER_DESKTOP_VIEWPORT_REM = 26;

export const DIAGRAM = {
  entranceMs: 420,
  entranceStaggerMs: 60,
  entranceTranslateY: 12,
  floatMs: 8000,
  floatTranslateY: -3,
  floatStaggerSeconds: -1.3,
  highlightMs: 3600,
  hoverIntentMs: 120,
  leaveGraceMs: 140,
  hoverTransitionMs: 200,
  parallaxPx: 70,
  intersectionThreshold: 0.2,
} as const;

export const STORY_CURSOR = {
  smoothing: 0.2,
  opacityMs: 200,
  scaleHidden: 0.7,
  scaleShown: 1,
  scalePressed: 0.9,
  scaleTransitionMs: 110,
} as const;

export const SHEET = {
  openMs: 260,
  closeMs: 170,
  width: "min(86vw, 340px)",
} as const;

export const HERO = {
  trackVh: 160,
  overlapVh: 45,
} as const;
