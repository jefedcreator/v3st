import { readFileSync } from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { Logo, LogoMark } from "@/components/logo";

const brandFile = readFileSync(path.join(process.cwd(), "docs/brand/v3st-grain.svg"), "utf8");

function brandAttribute(name: "d" | "viewBox"): string {
  const match = new RegExp(` ${name}="([^"]+)"`).exec(brandFile);
  if (match?.[1] === undefined) throw new Error(`docs/brand/v3st-grain.svg has no ${name}`);
  return match[1];
}

describe("Logo", () => {
  it("draws the grain exactly as docs/brand/v3st-grain.svg does", () => {
    const html = renderToStaticMarkup(createElement(LogoMark));
    expect(html).toContain(`viewBox="${brandAttribute("viewBox")}"`);
    expect(html).toContain(`d="${brandAttribute("d")}"`);
  });

  it("sets the name as live text beside a decorative mark", () => {
    const html = renderToStaticMarkup(createElement(Logo));
    expect(html).toMatch(/<\/svg>V3ST<\/span>$/);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("aria-label");
  });

  it("labels the mark when it stands alone", () => {
    const html = renderToStaticMarkup(createElement(Logo, { variant: "mark" }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="V3ST"');
    expect(html).not.toContain(">V3ST<");
  });

  it("tints the mark mint by default and drops to one ink without the accent", () => {
    expect(renderToStaticMarkup(createElement(LogoMark))).toContain('class="fill-gain"');
    const plain = renderToStaticMarkup(createElement(LogoMark, { accent: false }));
    expect(plain).toContain('fill="currentColor"');
    expect(plain).not.toContain("fill-gain");
  });

  it("lets one font-size class size the whole lockup", () => {
    const html = renderToStaticMarkup(createElement(Logo, { className: "text-[18px]" }));
    expect(html).toContain("text-[18px]");
    expect(html).not.toContain("text-[19px]");
  });
});
