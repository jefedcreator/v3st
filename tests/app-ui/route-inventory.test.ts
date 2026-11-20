import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

// The pages this app serves, each with its route group on disk.
const PAGES: { route: string; group: string }[] = [
  { route: "/signin", group: "(auth)/signin" },
  { route: "/setup", group: "(setup)/setup" },
  { route: "/home", group: "(app)/home" },
  { route: "/stocks", group: "(app)/stocks" },
  { route: "/stocks/[id]", group: "(app)/stocks/[id]" },
  { route: "/orders/[id]", group: "(app)/orders/[id]" },
  { route: "/cash", group: "(app)/cash" },
  { route: "/earn", group: "(app)/earn" },
  { route: "/earn/[id]", group: "(app)/earn/[id]" },
  { route: "/earnings", group: "(app)/earnings" },
  { route: "/activity", group: "(app)/activity" },
  { route: "/activity/[id]", group: "(app)/activity/[id]" },
  { route: "/settings", group: "(app)/settings" },
];

function pageFile(group: string): string {
  return path.join(ROOT, "src/app", group, "page.tsx");
}

describe("the app's route inventory", () => {
  it("resolves every page under its expected group", () => {
    for (const { group } of PAGES) {
      expect(existsSync(pageFile(group)), `${group}/page.tsx`).toBe(true);
    }
  });

  it("puts a loading.tsx beside every page except sign-in", () => {
    for (const { route, group } of PAGES) {
      if (route === "/signin") continue;
      expect(existsSync(path.join(ROOT, "src/app", group, "loading.tsx")), `${group}/loading.tsx`).toBe(true);
    }
  });

  it("redirects the backend's settings links", () => {
    for (const redirect of ["bank", "automations"]) {
      const file = path.join(ROOT, `src/app/(app)/settings/${redirect}/page.tsx`);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, "utf8")).toContain('redirect("/settings?open=');
    }
  });

  it("resolves every backend link to a page or redirect route", () => {
    const services = [
      path.join(ROOT, "src/backend/services/app/home.ts"),
      path.join(ROOT, "src/backend/services/notifications/index.ts"),
    ];
    const links = new Set<string>();
    for (const file of services) {
      const source = readFileSync(file, "utf8");
      const matches = [
        ...source.matchAll(/link:\s*(?:"([^"]+)"|`([^`]+)`)/g),
        ...source.matchAll(/const link = (?:"([^"]+)"|`([^`]+)`)/g),
      ];
      for (const match of matches) {
        const value = match[1] ?? match[2] ?? "";
        if (value !== "") links.add(value);
      }
    }
    expect(links.size).toBeGreaterThan(0);

    // Every route this app serves, as path segments with [id] for a dynamic one.
    const routes = [
      ...PAGES.map(({ route }) => route),
      "/settings/bank",
      "/settings/automations",
    ];
    const resolves = (segments: string[]): boolean =>
      routes.some((route) => route === `/${segments.join("/")}`);

    for (const link of links) {
      // A template placeholder (and an id with its activity prefix) is one segment.
      const normalised = link.replace(/\$\{[^}]+\}/g, "X");
      const segments = normalised.replace(/^\//, "").split("/");
      // Static segments first, then the last segment as [id].
      const asDynamic = [...segments.slice(0, -1), "[id]"];
      const resolved = resolves(segments) || (segments.length > 1 && resolves(asDynamic));
      expect(resolved, `unresolved backend link: ${link} (normalised ${normalised})`).toBe(true);
    }
  });
});
