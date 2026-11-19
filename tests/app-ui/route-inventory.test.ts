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

function routePatterns(): string[] {
  const out: string[] = [];
  for (const { group } of PAGES) out.push(path.join("src/app", group).replace(/\[id\]/g, "[^/]+"));
  for (const redirect of ["(app)/settings/bank", "(app)/settings/automations"]) {
    out.push(path.join("src/app", redirect).replace(/\[id\]/g, "[^/]+"));
  }
  return out;
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
    const patterns = routePatterns();
    const services = [
      path.join(ROOT, "src/backend/services/app/home.ts"),
      path.join(ROOT, "src/backend/services/notifications/index.ts"),
    ];
    const links = new Set<string>();
    for (const file of services) {
      const source = readFileSync(file, "utf8");
      const matches = [
        ...source.matchAll(/link:\s*(?:"([^"]+)"|`([^`]+)`)/g),
        ...source.matchAll(/const link = ("([^"]+)"|`([^`]+)`)/g),
      ];
      for (const match of matches) {
        const value = match[2] ?? match[3] ?? match[1] ?? "";
        if (value === "") continue;
        links.add(value);
      }
    }
    expect(links.size).toBeGreaterThan(0);
    for (const link of links) {
      // Normalise a parameterised path to its [id] route shape.
      let normalised = link.replace(/\$\{[^}]+\}/g, "X");
      normalised = normalised.replace(/\/(?:dep|wd|pay|ord|inv|eop|wk)_X(?=\/|$)/g, "/[id]");
      if (/\/[^/]+_X$/.test(normalised)) normalised = normalised.replace(/\/[^/]+$/, "/[id]");
      let resolved = false;
      for (const pattern of patterns) {
        const re = new RegExp(`^/api/v1/${pattern.replace(/[()]/g, "[()]*").replace(/\*/g, "")}$`);
        void re;
      }
      const route = normalised.replace(/^\//, "");
      const segments = route.split("/");
      const dynamic = segments
        .map((segment) => (/^\[id\]$/.test(segment) ? "[id]" : segment))
        .join("/");
      for (const { group } of PAGES) {
        const candidate = path.join("src/app", group);
        if (candidate.endsWith(dynamic) || candidate.endsWith(dynamic.replace(/^.*?\)\//, ""))) {
          resolved = true;
        }
      }
      // /settings/bank and /settings/automations are the redirect routes.
      if (normalised === "/settings/bank" || normalised === "/settings/automations") resolved = true;
      if (!resolved) {
        // Try segment-by-segment with [id] replacing a dynamic final segment.
        const parts = normalised.replace(/^\//, "").split("/");
        const candidates = [parts.join("/")];
        if (parts.length >= 2) candidates.push([...parts.slice(0, -1), "[id]"].join("/"));
        for (const candidate of candidates) {
          for (const { group } of PAGES) {
            if (group === candidate || group.endsWith(candidate)) resolved = true;
          }
          if (resolved) break;
        }
      }
      expect(resolved, `unresolved backend link: ${link} (normalised ${normalised})`).toBe(true);
    }
  });
});
