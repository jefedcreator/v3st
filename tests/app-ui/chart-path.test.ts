import { expect, it } from "vitest";

import { chartPath } from "@/components/app/stocks/chart-path";

it("draws a chart only from two or more points", () => {
  const pts = [
    { t: "2026-11-19T08:00:00Z", price_kobo: "100000" },
    { t: "2026-11-19T12:00:00Z", price_kobo: "200000" },
  ];
  expect(chartPath(pts, 300, 100)).toEqual({
    d: "M0,92 L300,8",
    first: "100000",
    last: "200000",
    min: "100000",
    max: "200000",
  });
  expect(chartPath([pts[0]!], 300, 100)).toBeNull();
  expect(
    chartPath([pts[0]!, { t: "2026-11-19T12:00:00Z", price_kobo: "100000" }], 300, 100)!.d,
  ).toBe("M0,50 L300,50");
});
