import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { expect, it } from "vitest";

import { TickerRow } from "@/components/landing/ticker-row";
import type { PublicTickerRow } from "@/types/landing";

// The browser suite builds against an unreachable database, so it only ever
// sees the no-price fallback. These pin the priced states the spec requires.

function row(overrides: Partial<PublicTickerRow>): PublicTickerRow {
  return {
    ticker: "AAPL",
    name: "Apple",
    sector: "Technology",
    logo_path: "/stocks/aapl.svg",
    price_kobo: "34215037",
    price_status: "live",
    price_is_estimate: false,
    price_as_of: "2026-12-04T13:05:00Z",
    change_24h_bps: 124,
    line_kobo: ["34000000", "34100000", "34215037"],
    ...overrides,
  };
}

function render(value: PublicTickerRow): string {
  return renderToStaticMarkup(createElement(TickerRow, { row: value }));
}

it("shows the rounded naira price, the signed change and the price line", () => {
  const html = render(row({}));
  expect(html).toContain(">₦342,150<");
  expect(html).toContain(">+1.24%<");
  expect(html).toContain("<polyline");
  expect(html).toContain('viewBox="0 0 120 32"');
  expect(html).not.toContain(">Delayed<");
  expect(html).not.toContain(">Estimate<");
});

it("marks a delayed price with a Delayed chip", () => {
  expect(render(row({ price_status: "delayed" }))).toContain(">Delayed<");
});

it("marks SpaceX's estimate with an Estimate chip, even with no price", () => {
  const html = render(
    row({
      ticker: "SPCX",
      name: "SpaceX",
      price_is_estimate: true,
      price_kobo: null,
      price_status: "unavailable",
      change_24h_bps: null,
      line_kobo: [],
    }),
  );
  expect(html).toContain(">Estimate<");
  expect(html).not.toContain("₦");
  expect(html).not.toContain("<polyline");
});

it("draws a falling line in the loss colour with a true minus", () => {
  const html = render(row({ change_24h_bps: -86 }));
  expect(html).toContain(">−0.86%<");
  expect(html).toContain("ticker-line ticker-loss");
});

it("labels the badge with the company name", () => {
  expect(render(row({}))).toContain('alt="Apple"');
});
