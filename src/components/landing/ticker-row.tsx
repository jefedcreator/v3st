import * as React from "react";

import type { PublicTickerRow } from "@/types/landing";

import { formatChangeBps, formatTickerPrice } from "./format";
import { LogoBadge } from "./logo-badge";

// One-day price line normalised into a 120x32 viewBox. BigInt keeps the
// scaling exact; the polyline is data (the day's prices), not decoration.
function sparklinePoints(line: readonly string[]): string | null {
  if (line.length < 2) return null;
  const values = line.map((value) => BigInt(value));
  let min = values[0]!;
  let max = values[0]!;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = max - min;
  const last = values.length - 1;
  return values
    .map((value, index) => {
      const x = (index * 120) / last;
      const t = span === 0n ? 0.5 : Number(((value - min) * 1000n) / span) / 1000;
      const y = 30 - t * 28;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function TickerRow(props: { row: PublicTickerRow }): React.JSX.Element {
  const { row } = props;
  const points = sparklinePoints(row.line_kobo);
  const change = row.change_24h_bps;
  const negative = change !== null && change < 0;
  const toneClass = negative ? "ticker-loss" : "ticker-gain";
  return (
    <li className="ticker-row">
      <LogoBadge ticker={row.ticker} logoPath={row.logo_path} alt={row.name} />
      <span className="ticker-id">
        <span className="ticker-symbol">{row.ticker}</span>
        <span className="ticker-chip">{row.sector}</span>
      </span>
      <span className="ticker-name">{row.name}</span>
      {points !== null ? (
        <svg
          className={`ticker-line ${toneClass}`}
          viewBox="0 0 120 32"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ) : (
        <span className="ticker-line ticker-line-empty" aria-hidden="true" />
      )}
      <span className="ticker-numbers">
        {row.price_kobo !== null ? (
          <span className="ticker-price">{formatTickerPrice(row.price_kobo)}</span>
        ) : null}
        {change !== null ? <span className={`ticker-change ${toneClass}`}>{formatChangeBps(change)}</span> : null}
        {row.price_status === "delayed" ? <span className="ticker-chip">Delayed</span> : null}
        {row.price_is_estimate ? <span className="ticker-chip">Estimate</span> : null}
      </span>
    </li>
  );
}
