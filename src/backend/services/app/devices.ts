const BROWSERS: [RegExp, string][] = [
  [/edg(?:e|ios|a)?\//i, "Edge"],
  [/opr\/|opera/i, "Opera"],
  [/chrome\/|crios\//i, "Chrome"],
  [/firefox\/|fxios\//i, "Firefox"],
  [/safari\//i, "Safari"],
];

const PLATFORMS: [RegExp, string][] = [
  [/android/i, "Android"],
  [/iphone|ipad|ipod/i, "iOS"],
  [/windows/i, "Windows"],
  [/mac os x|macintosh/i, "macOS"],
  [/linux/i, "Linux"],
];

export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const platform = PLATFORMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && platform) return `${browser} on ${platform}`;
  if (browser) return browser;
  if (platform) return platform;
  return "Unknown device";
}
