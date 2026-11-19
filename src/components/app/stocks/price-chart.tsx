"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/primitives";
import type { AppChartDto, ChartRange } from "@/types/app";
import { formatChangeBps } from "@/utils/format";
import { cn } from "@/utils/cn";
import { chartPath } from "./chart-path";

const RANGES: ChartRange[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

// The SVG price chart with its range tabs.
export function PriceChart({
  range,
  chart,
  onRangeChange,
}: {
  range: ChartRange;
  chart: AppChartDto | null;
  onRangeChange: (range: ChartRange) => void;
}) {
  const width = 640;
  const height = 160;
  const path = chart === null ? null : chartPath(chart.points, width, height);
  const up = chart?.change_bps === null || chart === undefined ? true : chart.change_bps >= 0;

  return (
    <div className="flex flex-col gap-3">
      <Tabs
        value={range}
        onValueChange={(value) => onRangeChange(value as ChartRange)}
      >
        <TabsList aria-label="Price range">
          {RANGES.map((r) => (
            <TabsTrigger key={r} value={r}>
              {r}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {chart === null && (
        <p className="text-muted-foreground text-sm">The chart isn't available right now.</p>
      )}
      {chart !== null && chart.status === "not_enough_data" && (
        <p className="text-muted-foreground text-sm">
          Not enough price history yet for this range.
        </p>
      )}
      {chart !== null && path === null && chart.status === "ok" && (
        <p className="text-muted-foreground text-sm">
          Not enough price history yet for this range.
        </p>
      )}
      {chart !== null && path !== null && (
        <div className="flex flex-col gap-1">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-40 w-full"
            role="img"
            aria-label={`Price from ${path.first} to ${path.last}`}
            preserveAspectRatio="none"
          >
            <path
              d={path.d}
              fill="none"
              strokeWidth={2}
              className={up ? "stroke-gain" : "stroke-loss"}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <p className="text-muted-foreground text-sm">
            {chart.change_bps === null
              ? "Change unavailable"
              : `Change ${formatChangeBps(chart.change_bps)}`}
          </p>
        </div>
      )}
    </div>
  );
}

