"use client";

import Link from "next/link";
import * as React from "react";

import type { AppHomeDto } from "@/types/app";
import type { MoneyLimits as Limits } from "@/types/app-ui";
import { cn } from "@/utils/cn";
import { moneyText } from "@/primitives/money-text";
import { BetaLine } from "@/components/app/beta-line";
import { SetupGate } from "@/components/app/setup-gate";
import { AddMoneyDialog } from "@/components/app/cash/add-money-dialog";
import { totalLines } from "./total";
import { Button } from "@/primitives";

// The band above the line: the total, today's change, cash and the pills.
export function TotalBand({ home, limits }: { home: AppHomeDto; limits: Limits }) {
  const [addOpen, setAddOpen] = React.useState(false);
  const { figure, note, change } = totalLines(home);
  return (
    <section className="flex flex-col gap-3 pt-4" aria-label="Total value">
      <p className="text-muted-foreground text-[13px] font-medium">Total value</p>
      <p className="type-app-figure text-heading">{figure}</p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {change !== null && (
          <span
            className={cn(
              "text-sm tabular-nums",
              home.change_24h_kobo !== null && BigInt(home.change_24h_kobo) < 0n
                ? "text-loss"
                : "text-gain",
            )}
          >
            {change}
          </span>
        )}
        <span className="text-muted-foreground text-sm">
          Cash {moneyText(home.cash.available_kobo)} available
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SetupGate label="Finish setting up to add money">
          <Button onClick={() => setAddOpen(true)}>Add money</Button>
        </SetupGate>
        <Button variant="outline" asChild>
          <Link href="/stocks">Invest</Link>
        </Button>
      </div>
      {note !== null && <p className="text-muted-foreground text-sm">{note}</p>}
      <BetaLine notice={home.beta.notice} />
      <AddMoneyDialog open={addOpen} onOpenChange={setAddOpen} limits={limits} />
    </section>
  );
}
