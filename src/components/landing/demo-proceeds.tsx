import { Badge, Button } from "@/primitives";
import { landingDemoFixture } from "./demo-fixtures";
import { formatNgn, payoutPreview } from "./demo-money";

type ProceedsScenario = "eligible" | "below_minimum" | "at_minimum";

const SCENARIOS: readonly {
  id: ProceedsScenario;
  label: string;
  grossKobo: string;
}[] = [
  {
    id: "eligible",
    label: "Qualifying",
    grossKobo: landingDemoFixture.proceeds.qualifyingGrossKobo,
  },
  {
    id: "below_minimum",
    label: "Below minimum",
    grossKobo: landingDemoFixture.proceeds.belowMinimumGrossKobo,
  },
  {
    id: "at_minimum",
    label: "At minimum",
    grossKobo: landingDemoFixture.proceeds.atMinimumGrossKobo,
  },
];

export function DemoProceeds({
  scenario,
  preference,
  onScenario,
  onPreference,
}: {
  scenario: ProceedsScenario;
  preference: "payout" | "reinvest";
  onScenario: (next: ProceedsScenario) => void;
  onPreference: (next: "payout" | "reinvest") => void;
}) {
  const grossKobo =
    SCENARIOS.find((sc) => sc.id === scenario)?.grossKobo ??
    landingDemoFixture.proceeds.qualifyingGrossKobo;
  const preview = payoutPreview(grossKobo);
  const f = landingDemoFixture.proceeds;

  return (
    <div className="rounded-2xl border border-rule bg-surface p-6">
      <Badge variant="secondary">Independent illustrative example</Badge>

      <div
        role="group"
        aria-label="Proceeds scenario"
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
      <div
        role="group"
        aria-label="Payout or reinvest"
        className="mt-3 flex flex-wrap gap-2"
      >
        {(
          [
            { id: "payout", label: "Payout" },
            { id: "reinvest", label: "Reinvest" },
          ] as const
        ).map((p) => (
          <Button
            key={p.id}
            variant={preference === p.id ? "default" : "outline"}
            size="sm"
            aria-pressed={preference === p.id}
            onClick={() => onPreference(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <dl className="mt-4 divide-y divide-rule">
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-ink-muted">Gross proceeds</dt>
          <dd className="text-lg font-semibold text-ink tabular-nums">
            {formatNgn(preview.grossKobo)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-ink-muted">
            Gross minimum {formatNgn(f.minimumGrossKobo)} checked first
          </dt>
          <dd className="text-lg font-semibold text-ink">
            {preview.status === "qualifies" ? "Qualifies" : "Below minimum"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-ink-muted">Example fee</dt>
          <dd className="text-lg font-semibold text-ink tabular-nums">
            {formatNgn(preview.feeKobo)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-ink-muted">Received (gross − fee)</dt>
          <dd className="text-lg font-semibold text-ink tabular-nums">
            {formatNgn(preview.receivedKobo)}
          </dd>
        </div>
        {preview.status === "rollover" ? (
          <div className="flex items-baseline justify-between gap-4 py-3">
            <dt className="text-ink-muted">Rolls over to next Friday</dt>
            <dd className="text-lg font-semibold text-ink tabular-nums">
              {formatNgn(preview.rolloverKobo)}
            </dd>
          </div>
        ) : null}
      </dl>

      {preference === "payout" ? (
        <p className="mt-3 text-sm text-ink-muted">
          Bank payout example:{" "}
          <strong className="font-semibold text-ink">
            Example bank · account •••• 1234
          </strong>{" "}
          — masked illustration only, no identity inputs and no transferable
          numbers.
        </p>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">
          Reinvestment allocates eligible confirmed proceeds subject to a
          separate authorization and its own possible costs. The bank-payout
          fee shown in this example is not applied to reinvestment.
        </p>
      )}
    </div>
  );
}
