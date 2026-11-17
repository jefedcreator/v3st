import { readdirSync } from "node:fs";

import { expect, it } from "vitest";

it("never ships a DESIGN.md beside the product document Design.md", () => {
  const names = readdirSync(process.cwd());
  expect(names).toContain("Design.md");
  expect(names).toContain("DESIGN_SYSTEM.md");
  expect(names.filter((name) => name === "DESIGN.md")).toEqual([]);
});
