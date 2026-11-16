import { Badge, Button } from "@/primitives";
import { landingDemoFixture } from "./demo-fixtures";
import { formatNgn } from "./demo-money";

type StrategyScenario = "eligible" | "zero_income" | "principal_loss";

const SCENARIOS: readonly { id: StrategyScenario; label: string }[] = [
  { id: "eligible", label: "Eligible confirmed proceeds" },
  { id: "zero_income", label: "Zero income" },
  { id: "principal_loss", label: "Principal loss" },
];

export function DemoStrategies({
  opened,
  scenario,
  onOpen,
  onScenario,
}: {
  opened: boolean;
  scenario: StrategyScenario;
  onOpen: () => void;
  onScenario: (next: StrategyScenario) => void;
}) {
  const s = landingDemoFixture.strategy;

  return (
    <div className="rounded-2xl border border-rule bg-surface p-6">
      <Badge variant="secondary">Independent illustrative example</Badge>
      {!opened ? (
        <div className="mt-4">
          <p className="text-lg font-semibold text-ink">No strategy selected</p>
          <p className="mt-2 text-ink-muted">
            Opening the chapter changes no consent. Strategies are separate,
            optional and explicit; holding stock or idle cash earns nothing.
          </p>
          <Button className="mt-4" variant="outline" size="sm" onClick={onOpen}>
            Open strategy example
          </Button>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-ink-muted">
            The example mechanism below is a demo comparison only — it is not
            an authorization.
          </p>
          <div
            role="group"
            aria-label="Strategy scenarios"
            className="mt-4 flex flex-wrap gap-2"
          >
            {SCENARIOS.map((sc) => (
              <Button
                key={sc.id}
                variant={scenario === sc.id ? "default" : "outline"}
                size="sm"
                aria-pressed={scenario === sc.id}
                onClick={() => onScenario(sc.id)}
              >
                {sc.label}
              </Button>
            ))}
          </div>
          <dl className="mt-4 divide-y divide-rule">
            {scenario === "eligible" ? (
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-ink-muted">Eligible confirmed income</dt>
                <dd className="text-lg font-semibold text-ink tabular-nums">
                  {formatNgn(s.eligibleIncomeKobo)}
                </dd>
              </div>
            ) : null}
            {scenario === "zero_income" ? (
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-ink-muted">Income</dt>
                <dd className="text-lg font-semibold text-ink tabular-nums">
                  {formatNgn("0")}
                </dd>
              </div>
            ) : null}
            {scenario === "principal_loss" ? (
              <>
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-ink-muted">Illustrative principal</dt>
                  <dd className="text-lg font-semibold text-ink tabular-nums">
                    {formatNgn(s.initialPrincipalKobo)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-ink-muted">Example exit value</dt>
                  <dd className="text-lg font-semibold text-ink tabular-nums">
                    {formatNgn(s.lossExitKobo)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-ink-muted">Change (not income)</dt>
                  <dd className="text-lg font-semibold text-ink tabular-nums">
                    {formatNgn(s.lossKobo)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-ink-muted">Income</dt>
                  <dd className="text-lg font-semibold text-ink tabular-nums">
                    {formatNgn("0")}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
          <p className="mt-3 text-sm text-ink-muted">
            Returned principal is separate from income. Unconverted stock
            rewards are not yet payable.
          </p>
        </div>
      )}
    </div>
  );
}
