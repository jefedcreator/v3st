import { Badge } from "@/primitives";
import { landingDemoFixture } from "./demo-fixtures";
import { formatNgn, formatUnits } from "./demo-money";

export function DemoFunding() {
  const f = landingDemoFixture.funding;
  const units = formatUnits(f.settlementMicro, 6);
  const unitsDisplay = units.includes(".") ? units : `${units}.000000`;

  return (
    <div className="rounded-2xl border border-rule bg-surface p-6">
      <Badge variant="secondary">Independent illustrative example</Badge>
      <dl className="mt-4 divide-y divide-rule">
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-ink-muted">Example gross deposit</dt>
          <dd className="text-lg font-semibold text-ink tabular-nums">
            {formatNgn(f.grossKobo)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-ink-muted">Example fee</dt>
          <dd className="text-lg font-semibold text-ink tabular-nums">
            {formatNgn(f.feeKobo)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-ink-muted">Available (gross − fee)</dt>
          <dd className="text-lg font-semibold text-ink tabular-nums">
            {formatNgn(f.availableKobo)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-ink-muted">Example rate</dt>
          <dd className="text-lg font-semibold text-ink tabular-nums">
            {formatNgn(f.rateKoboPerUsd)} per USD
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-ink-muted">Settlement equivalent</dt>
          <dd className="text-lg font-semibold text-ink tabular-nums">
            {unitsDisplay} USDC-equivalent ({f.settlementMicro} micro-units)
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-ink-muted">
        The rate and fees are illustrative beta settings — not a provider
        quotation or a recommendation. No transferable account number is
        shown in this preview.
      </p>
    </div>
  );
}
