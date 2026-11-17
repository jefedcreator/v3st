import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

const css = readFileSync("src/styles/globals.css", "utf8");

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css);
  if (!match) throw new Error(`missing literal token --color-${name}`);
  return match[1]!.toLowerCase();
}

function channel(hex: string, index: number): number {
  return parseInt(hex.slice(index, index + 2), 16) / 255;
}

function luminance(hex: string): number {
  const linear = [1, 3, 5].map((i) => {
    const c = channel(hex.toLowerCase(), i);
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

it("declares the spec palette exactly", () => {
  expect(token("void")).toBe("#020604");
  expect(token("inset")).toBe("#050b08");
  expect(token("surface")).toBe("#08100c");
  expect(token("surface-raised")).toBe("#0c1712");
  expect(token("stroke")).toBe("#15211b");
  expect(token("control-border")).toBe("#5a6f62");
  expect(token("ink")).toBe("#e3ebe6");
  expect(token("heading")).toBe("#ffffff");
  expect(token("muted-foreground")).toBe("#93a69b");
  expect(token("subtle")).toBe("#7f9187");
  expect(token("signal")).toBe("#00804d");
  expect(token("signal-hover")).toBe("#009459");
  expect(token("gain")).toBe("#3ddc97");
  expect(token("loss")).toBe("#ff6b5a");
});

it("meets the contrast floor on the void ground", () => {
  for (const name of ["ink", "heading", "muted-foreground", "subtle", "gain", "loss"])
    expect(contrast(token(name), token("void"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast("#ffffff", token("signal"))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(token("control-border"), token("void"))).toBeGreaterThanOrEqual(3);
  expect(contrast(token("control-border"), token("surface"))).toBeGreaterThanOrEqual(3);
});

it("themes the browser's own surfaces", () => {
  expect(css).toContain("color-scheme: dark");
  expect(css).toMatch(/::selection\s*{[^}]*var\(--color-signal\)/);
  expect(css).toMatch(/caret-color:\s*var\(--color-gain\)/);
  expect(css).toMatch(/scrollbar-color:\s*#23342B\s+var\(--color-void\)/i);
  expect(css).toMatch(/font-variant-numeric:\s*tabular-nums/);
  expect(css).toMatch(/text-underline-offset:\s*0\.2em/);
});
