// The pinned motion contract for the landing page. Pure and browser-safe:
// every number here comes from the behaviour contract, and the unit tests pin
// them. Nothing in this file touches the DOM.

export type HeroGroup = "background" | "heading" | "copy" | "actions" | "rail";
export type HeroFrame = Record<HeroGroup, number> & { navCue: number; headerCta: number };

export const HERO_GROUPS: readonly HeroGroup[] = [
  "background",
  "heading",
  "copy",
  "actions",
  "rail",
];

// Intro windows in ms since the choreography started, per hero group.
export const HERO_INTRO: Record<HeroGroup, readonly [number, number]> = {
  background: [0, 900],
  heading: [200, 900],
  copy: [480, 1180],
  actions: [760, 1460],
  rail: [1040, 1740],
};

// Scroll-handover windows in handover progress (0..1), per hero group.
export const HERO_HANDOVER: Record<HeroGroup, readonly [number, number]> = {
  actions: [0, 0.4],
  rail: [0, 0.36],
  copy: [0.18, 0.66],
  heading: [0.4, 1],
  background: [0.45, 1],
};

export const NAV_CUE = { fromMs: 2120, spanMs: 900 } as const;
export const SCROLL_EASE = 0.18;
export const MAX_FRAME_MS = 64;
export const HERO_TRACK_VH = 160;
export const HERO_OVERLAP_VH = 45;
export const HERO_FIT_CLEARANCE_PX = 190;
export const SKIP_INTRO_ELAPSED_MS = 10_000;

const FRAME_MS = 16.67;

export function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

// One choreography frame. Each group is its intro ramp times (1 minus its
// scroll-handover ramp), where the handover ramps on h = S((progress - 0.30)/0.70).
export function heroFrame(input: { elapsedMs: number; progress: number }): HeroFrame {
  const h = smoothstep((input.progress - 0.3) / 0.7);
  const groups = {} as Record<HeroGroup, number>;
  for (const group of HERO_GROUPS) {
    const [fromMs, toMs] = HERO_INTRO[group];
    const [from, to] = HERO_HANDOVER[group];
    const intro = smoothstep((input.elapsedMs - fromMs) / (toMs - fromMs));
    const handover = smoothstep((h - from) / (to - from));
    groups[group] = intro * (1 - handover);
  }
  return {
    ...groups,
    navCue: smoothstep((input.elapsedMs - NAV_CUE.fromMs) / NAV_CUE.spanMs),
    headerCta: h,
  };
}

// Frame-rate-independent exponential smoothing: easing a half frame twice is
// the same as easing a full frame once, and deltas cap at MAX_FRAME_MS.
export function smoothProgress(current: number, target: number, deltaMs: number): number {
  const dt = Math.min(deltaMs, MAX_FRAME_MS);
  const k = 1 - Math.pow(1 - SCROLL_EASE, dt / FRAME_MS);
  return current + (target - current) * k;
}

// Scroll progress of the hero track: 0 when its top is at the viewport top,
// 1 when its bottom reaches the viewport bottom.
export function heroTargetProgress(
  rect: { top: number; height: number },
  viewportHeight: number,
): number {
  const span = rect.height - viewportHeight;
  if (span <= 0) return rect.top <= 0 ? 1 : 0;
  return Math.min(1, Math.max(0, -rect.top / span));
}

// The intro only plays on a fresh load that lands at the top of the page
// before hydration is late and no anchor was followed.
export function shouldPlayIntro(input: {
  hydratedAtMs: number;
  scrollY: number;
  hash: string;
}): boolean {
  return input.hydratedAtMs < 600 && input.scrollY < 5 && input.hash === "";
}

// The pinned 160vh track only applies when the whole hero fits with clearance;
// short viewports, zoom and reduced motion keep ordinary flow.
export function heroFits(input: {
  viewportHeight: number;
  contentHeight: number;
  railHeight: number;
  reducedMotion: boolean;
}): boolean {
  if (input.reducedMotion) return false;
  return (
    input.viewportHeight >= input.contentHeight + input.railHeight + HERO_FIT_CLEARANCE_PX
  );
}

export const TICKER_SECONDS_PER_ROW = 4.5;
export function tickerDurationSeconds(rows: number): number {
  return rows * TICKER_SECONDS_PER_ROW;
}

export const COUNTER = { durationMs: 800, threshold: 0.35 } as const;
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// While counting, decimals widen below 100/10 the way Katana's counters do;
// when settled the figure keeps exactly its own decimals.
export function counterDecimals(value: number, decimals: number): number {
  if (value >= 100) return decimals;
  if (value >= 10) return Math.max(decimals, 1);
  return Math.max(decimals, 2);
}

export const DIAGRAM = {
  threshold: 0.2,
  enterMs: 420,
  staggerMs: 60,
  riseFromPx: 12,
  reducedFadeMs: 200,
  autoplayDelayMs: 1080,
  stepMs: 3600,
  hoverIntentMs: 120,
  leaveGraceMs: 140,
  highlightMs: 200,
  floatSeconds: 8,
  floatRisePx: 3,
  floatDelayStepSeconds: -1.3,
} as const;

export const PARALLAX_PX = 70;
export function parallaxOffset(input: {
  viewportHeight: number;
  sectionCenterY: number;
  sectionHeight: number;
}): number {
  const range = input.viewportHeight / 2 + input.sectionHeight / 2;
  const raw = (-(input.sectionCenterY - input.viewportHeight / 2) / range) * PARALLAX_PX;
  return Math.max(-PARALLAX_PX, Math.min(PARALLAX_PX, raw));
}

export const CURSOR = {
  smoothing: 0.2,
  fadeMs: 200,
  scaleMs: 110,
  scaleHidden: 0.7,
  scaleShown: 1,
  scalePressed: 0.9,
} as const;
export function followerStep(current: number, target: number, deltaMs: number): number {
  const dt = Math.min(deltaMs, MAX_FRAME_MS);
  const k = 1 - Math.pow(1 - CURSOR.smoothing, dt / FRAME_MS);
  return current + (target - current) * k;
}

export const SHEET = { openMs: 260, closeMs: 170 } as const;

export const FLUID_SETTINGS = {
  mouseForce: 15,
  cursorSize: 300,
  isViscous: false,
  viscous: 30,
  iterationsViscous: 14,
  dt: 0.011,
  iterationsPoisson: 38,
  resolution: 0.5,
  dissipation: 0.992,
  isBounce: true,
  autoDemo: true,
  autoSpeed: 0.28,
  autoIntensity: 6.4,
  takeoverDuration: 0.25,
  autoResumeDelay: 350,
  autoRampDuration: 1.4,
} as const;
export const FLUID_COLORS = ["#0D6A3D", "#0D6A3D", "#008A52"] as const;
