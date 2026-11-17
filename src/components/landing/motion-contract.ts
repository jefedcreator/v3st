export const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));
export const smoothstep = (value: number): number => {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
};

export type HeroFrame = {
  background: number;
  heading: number;
  copy: number;
  actions: number;
  rail: number;
  navReveal: number;
  ctaReveal: number;
};

export function smoothProgress(
  current: number,
  target: number,
  deltaMs: number,
): number {
  return (
    current +
    (clamp(target) - current) *
      (1 - Math.pow(1 - 0.18, clamp(deltaMs, 0, 64) / 16.67))
  );
}

export function heroFrame({
  elapsedMs,
  progress,
}: {
  elapsedMs: number;
  progress: number;
}): HeroFrame {
  const h = smoothstep((clamp(progress) - 0.3) / 0.7);
  const opacity = (
    start: number,
    end: number,
    fadeStart: number,
    fadeEnd: number,
  ) =>
    smoothstep((elapsedMs - start) / (end - start)) *
    (1 - smoothstep((h - fadeStart) / (fadeEnd - fadeStart)));
  return {
    background: opacity(0, 900, 0.45, 1),
    heading: opacity(200, 900, 0.4, 1),
    copy: opacity(480, 1180, 0.18, 0.66),
    actions: opacity(760, 1460, 0, 0.4),
    rail: opacity(1040, 1740, 0, 0.36),
    navReveal: smoothstep((elapsedMs - 2120) / 900),
    ctaReveal: h,
  };
}
