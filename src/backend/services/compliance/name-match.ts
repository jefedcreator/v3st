function normalize(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length > 0);
}

function isSubMultiset(shorter: string[], longer: string[]): boolean {
  const counts = new Map<string, number>();
  for (const token of longer) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  for (const token of shorter) {
    const remaining = counts.get(token) ?? 0;
    if (remaining <= 0) return false;
    counts.set(token, remaining - 1);
  }
  return true;
}

export function nameMatches(verified: string, candidate: string): boolean {
  const a = normalize(verified);
  const b = normalize(candidate);
  if (a.length < 2 || b.length < 2) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return isSubMultiset(shorter, longer);
}
