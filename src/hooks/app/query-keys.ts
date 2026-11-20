// Query keys for every app read, and the mapping from stream areas to keys.

export const appKeys = {
  session: ["session"] as const,
  onboarding: ["onboarding"] as const,
  profile: ["profile"] as const,
  devices: ["devices"] as const,
  automations: ["automations"] as const,
  home: ["home"] as const,
  cash: ["cash"] as const,
  bankAccount: ["bank-account"] as const,
  banks: ["banks"] as const,
  deposit: (id: string) => ["deposit", id] as const,
  holdings: ["holdings"] as const,
  stocks: (q: { q?: string; watchlist?: boolean }) => ["stocks", q] as const,
  stock: (id: string) => ["stock", id] as const,
  chart: (id: string, range: string) => ["stock", id, "chart", range] as const,
  order: (id: string) => ["orders", id] as const,
  earnProducts: ["earn"] as const,
  earnProduct: (id: string) => ["earn", id] as const,
  earnings: ["earnings"] as const,
  activityPreview: ["activity", "preview"] as const,
  activityList: ["activity", "list"] as const,
  activityItem: (id: string) => ["activity", "item", id] as const,
  notifications: ["notifications"] as const,
  documents: ["documents"] as const,
  document: (slug: string) => ["documents", slug] as const,
};

// Each stream area invalidates the query key prefixes that carry its data.
export const AREA_KEYS: Record<string, readonly (readonly unknown[])[]> = {
  home: [["home"]],
  cash: [["cash"], ["home"], ["deposit"]],
  orders: [["orders"], ["home"]],
  holdings: [["holdings"], ["home"], ["stock"]],
  earn: [["earn"], ["home"]],
  earnings: [["earnings"], ["home"]],
  activity: [["activity"], ["home"]],
  notifications: [["notifications"], ["session"]],
};

// The key prefixes a changed frame invalidates, deduped in first-seen order.
export function keysForAreas(areas: readonly string[]): readonly (readonly unknown[])[] {
  const out: (readonly unknown[])[] = [];
  for (const area of areas) {
    const keys = AREA_KEYS[area];
    if (keys === undefined) continue;
    for (const key of keys) {
      if (!out.some((seen) => seen.length === key.length && seen.every((v, i) => v === key[i]))) {
        out.push(key);
      }
    }
  }
  return out;
}
