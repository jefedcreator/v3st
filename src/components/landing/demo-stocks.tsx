import { Badge, Button } from "@/primitives";
import { landingDemoFixture } from "./demo-fixtures";
import type { DemoStock } from "./demo.types";
import { formatNgn, formatUnits } from "./demo-money";

export function DemoStocks({
  selected,
  onSelect,
}: {
  selected: DemoStock["id"];
  onSelect: (id: DemoStock["id"]) => void;
}) {
  const stock =
    landingDemoFixture.stocks.find((s) => s.id === selected) ??
    landingDemoFixture.stocks[0];

  return (
    <div className="rounded-2xl border border-rule bg-surface p-6">
      <Badge variant="secondary">Independent illustrative example</Badge>
      <div
        role="group"
        aria-label="Fictional stock example"
        className="mt-4 flex flex-wrap gap-2"
      >
        {landingDemoFixture.stocks.map((s) => (
          <Button
            key={s.id}
            variant={s.id === selected ? "default" : "outline"}
            size="sm"
            aria-pressed={s.id === selected}
            onClick={() => onSelect(s.id)}
          >
            {s.id} · {s.name}
          </Button>
        ))}
      </div>
      <dl className="mt-4 divide-y divide-rule">
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-ink-muted">Fractional quantity</dt>
          <dd className="text-lg font-semibold text-ink tabular-nums">
            {formatUnits(stock.quantityRaw, stock.decimals)} units
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-ink-muted">Reference price</dt>
          <dd className="text-lg font-semibold text-ink tabular-nums">
            {formatNgn(stock.unitPriceKobo)} / unit
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-ink-muted">Reference value</dt>
          <dd className="text-lg font-semibold text-ink tabular-nums">
            {formatNgn(stock.valueKobo)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-ink-muted">
        TSTA and TSTB are fictional. Valuation and appreciation are not
        payable cash, and these amounts are unrelated to the funding example.
      </p>
    </div>
  );
}
