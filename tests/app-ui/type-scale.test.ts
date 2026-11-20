import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/styles/globals.css"), "utf8");

function utilityBody(name: string): string {
  const start = css.indexOf(`@utility ${name} {`);
  if (start === -1) throw new Error(`missing @utility ${name}`);
  const end = css.indexOf("}", start);
  return css.slice(start, end);
}

const EXPECTED: Record<string, { "font-size": string; "font-weight": string; "line-height": string; "letter-spacing"?: string }> = {
  "type-app-figure": { "font-size": "2.5rem", "font-weight": "300", "line-height": "1.05", "letter-spacing": "-0.02em" },
  "type-app-amount": { "font-size": "2rem", "font-weight": "300", "line-height": "1.1" },
  "type-app-title": { "font-size": "1.5rem", "font-weight": "500", "line-height": "1.25" },
  "type-app-heading": { "font-size": "1.125rem", "font-weight": "600", "line-height": "1.35" },
};

describe("the app type scale", () => {
  it("defines each utility with exactly the pinned values", () => {
    for (const [name, props] of Object.entries(EXPECTED)) {
      const body = utilityBody(name);
      for (const [prop, value] of Object.entries(props)) {
        expect(body, `${name} ${prop}`).toContain(`${prop}: ${value};`);
      }
    }
  });
  it("never clamps the app scale", () => {
    for (const name of Object.keys(EXPECTED)) {
      expect(utilityBody(name)).not.toContain("clamp(");
    }
  });
});
