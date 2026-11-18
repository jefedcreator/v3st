import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { expect, it } from "vitest";

import { BUILT_WITH } from "@/components/landing/brand-catalogue";
import { BrandMark } from "@/components/landing/brand-mark";
import { LogoBadge } from "@/components/landing/logo-badge";

function render<P extends object>(
  component: (props: P) => React.JSX.Element,
  props: P,
): string {
  return renderToStaticMarkup(createElement(component, props));
}

it("renders the logo when its file exists", () => {
  expect(render(LogoBadge, { ticker: "AAPL", logoPath: "/stocks/aapl.svg" })).toContain(
    'src="/stocks/aapl.svg"',
  );
});

it("falls back to the ticker letters when the file is missing", () => {
  const html = render(LogoBadge, { ticker: "ZZZZ", logoPath: "/stocks/zzzz.svg" });
  expect(html).not.toContain("<img");
  expect(html).toContain(">ZZZZ<");
});

it("falls back to the brand name when a provider file is missing", () => {
  const html = render(BrandMark, {
    brand: { ...BUILT_WITH[0]!, src: "/brands/missing.svg" },
  });
  expect(html).not.toContain("<img");
  expect(html).toContain("Yellow Card");
});
