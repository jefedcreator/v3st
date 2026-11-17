"use client";
import { Button } from "@/primitives";
import { landingDemoFixture } from "./demo-fixtures";
import { formatNgn, formatUnits } from "./demo-money";
export function DemoStocks({
  selected,
  onSelect,
}: {
  selected: "TSTA" | "TSTB";
  onSelect: (id: "TSTA" | "TSTB") => void;
}) {
  const stock = landingDemoFixture.stocks.find((item) => item.id === selected)!;
  return (
    <div className="demo-chapter">
      <div className="demo-explainer">
        <h3>A fraction, explained.</h3>
        <p>
          Choose a fictional stock to compare quantity and reference value.
          These amounts are unrelated to the funding example.
        </p>
        <div className="choice-row" aria-label="Fictional stock examples">
          {landingDemoFixture.stocks.map((item) => (
            <Button
              key={item.id}
              variant={selected === item.id ? "default" : "outline"}
              aria-pressed={selected === item.id}
              onClick={() => onSelect(item.id)}
            >
              {item.name}
            </Button>
          ))}
        </div>
        <p className="demo-caution">
          Reference valuation is not an executable quote or payable cash.
          Prices, FX and principal can fall.
        </p>
      </div>
      <div className="demo-result">
        <span className="fictional-symbol">{stock.id}</span>
        <span className="result-label">{stock.name} · Fictional</span>
        <strong className="result-amount financial">
          {formatUnits(stock.quantityRaw, stock.decimals)}
          <span> units</span>
        </strong>
        <dl className="money-list">
          <div>
            <dt>Reference price per unit</dt>
            <dd>{formatNgn(stock.unitPriceKobo)}</dd>
          </div>
          <div>
            <dt>Reference value</dt>
            <dd>{formatNgn(stock.valueKobo)}</dd>
          </div>
        </dl>
        <p className="result-footnote">
          Quantity × reference price = estimated value.
          <br />
          Tokenized stock exposure does not promise direct ownership of company
          shares.
        </p>
      </div>
    </div>
  );
}
