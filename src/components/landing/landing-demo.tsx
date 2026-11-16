"use client";

import { useRef, useState } from "react";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@/primitives";
import { landingDemoFixture } from "./demo-fixtures";
import type { DemoStage } from "./demo.types";
import { DemoFunding } from "./demo-funding";
import { DemoStocks } from "./demo-stocks";
import { DemoStrategies } from "./demo-strategies";
import { DemoProceeds } from "./demo-proceeds";

const STAGES: readonly { value: DemoStage; label: string }[] = [
  { value: "funding", label: "Add naira" },
  { value: "stocks", label: "Explore stocks" },
  { value: "strategies", label: "Choose a strategy" },
  { value: "proceeds", label: "Review proceeds" },
];

type StrategyScenario = "eligible" | "zero_income" | "principal_loss";
type ProceedsScenario = "eligible" | "below_minimum" | "at_minimum";

export function LandingDemo() {
  const [stage, setStage] = useState<DemoStage>("funding");
  const [selectedStock, setSelectedStock] = useState<"TSTA" | "TSTB">("TSTA");
  const [strategyOpened, setStrategyOpened] = useState(false);
  const [strategyScenario, setStrategyScenario] =
    useState<StrategyScenario>("eligible");
  const [proceedsScenario, setProceedsScenario] =
    useState<ProceedsScenario>("eligible");
  const [preference, setPreference] = useState<"payout" | "reinvest">("payout");
  const [announcement, setAnnouncement] = useState("");
  const fundingTabRef = useRef<HTMLButtonElement>(null);

  const reset = () => {
    setStage("funding");
    setSelectedStock("TSTA");
    setStrategyOpened(false);
    setStrategyScenario("eligible");
    setProceedsScenario("eligible");
    setPreference("payout");
    setAnnouncement("Demo reset to the Add naira chapter.");
    fundingTabRef.current?.focus();
  };

  return (
    <section
      id="demo"
      aria-labelledby="demo-heading"
      className="mx-auto max-w-[1200px] px-6 py-14 md:py-28"
    >
      <h2
        id="demo-heading"
        className="max-w-2xl text-3xl font-bold tracking-tight text-balance text-ink md:text-5xl"
      >
        Try the illustrative demo
      </h2>
      <p className="mt-4 max-w-2xl text-lg text-ink-muted">
        Four local chapters with independent example figures. Nothing here
        touches an API, a wallet or a bank — it is fixture data on this page
        only.
      </p>
      <ol className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm font-medium text-ink-muted">
        {STAGES.map((s, index) => (
          <li key={s.value}>
            {index + 1}. {s.label}
          </li>
        ))}
      </ol>
      <noscript>
        <p className="mt-4 rounded-xl border border-rule bg-sage p-4 text-sm text-ink">
          This walkthrough is available without JavaScript. Enable JavaScript
          to try the interactive examples.
        </p>
      </noscript>

      <div className="mt-8">
        <Tabs
          value={stage}
          onValueChange={(value) => {
            const next = value as DemoStage;
            setStage(next);
            const label = STAGES.find((s) => s.value === next)?.label ?? next;
            setAnnouncement(`Chapter: ${label}`);
          }}
        >
          <TabsList
            aria-label="Demo chapters"
            className="h-auto w-full flex-wrap justify-start rounded-2xl group-data-[orientation=horizontal]/tabs:h-auto sm:w-fit sm:flex-nowrap sm:rounded-full"
          >
            {STAGES.map((s, index) => (
              <TabsTrigger
                key={s.value}
                value={s.value}
                ref={index === 0 ? fundingTabRef : undefined}
                className="h-11 flex-1 px-3 text-xs whitespace-nowrap sm:flex-none sm:px-4 sm:text-sm"
              >
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="funding" className="pt-6">
            <DemoFunding />
          </TabsContent>
          <TabsContent value="stocks" className="pt-6">
            <DemoStocks
              selected={selectedStock}
              onSelect={(id) => {
                setSelectedStock(id);
                setAnnouncement(`Stock example: ${id}`);
              }}
            />
          </TabsContent>
          <TabsContent value="strategies" className="pt-6">
            <DemoStrategies
              opened={strategyOpened}
              scenario={strategyScenario}
              onOpen={() => {
                setStrategyOpened(true);
                setAnnouncement("Strategy example opened. No strategy is selected.");
              }}
              onScenario={(next) => {
                setStrategyScenario(next);
                setAnnouncement(`Strategy scenario: ${next.replace("_", " ")}`);
              }}
            />
          </TabsContent>
          <TabsContent value="proceeds" className="pt-6">
            <DemoProceeds
              scenario={proceedsScenario}
              preference={preference}
              onScenario={(next) => {
                setProceedsScenario(next);
                setAnnouncement(`Proceeds scenario: ${next.replace("_", " ")}`);
              }}
              onPreference={(next) => {
                setPreference(next);
                setAnnouncement(
                  next === "payout" ? "Preference: payout" : "Preference: reinvest",
                );
              }}
            />
          </TabsContent>
        </Tabs>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button variant="outline" size="sm" onClick={reset}>
          <ArrowCounterClockwise className="size-4" weight="bold" />
          Reset demo
        </Button>
        <p className="text-sm text-ink-muted">
          Reset restores every default. Nothing is persisted.
        </p>
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

export { landingDemoFixture };
