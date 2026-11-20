"use client";

import Link from "next/link";

import type { AppHomeDto } from "@/types/app";
import { cn } from "@/utils/cn";
import { moneyText } from "@/primitives/money-text";
import { BetaLine } from "@/components/app/beta-line";
import { SetupGate } from "@/components/app/setup-gate";
import { Button } from "@/primitives";
import { totalLines } from "./total";

// The band above the line: the total and its honesty note, today's change,
// cash available, the two pills and the API's beta line.
export function TotalBand({ home, onAddMoney }: { home: AppHomeDto; onAddMoney: () => void }) {
  const { figure, note, change } = totalLines(home);
  const changeTone =
    home.change_24h_kobo === null || BigInt(home.change_24h_kobo) === 0n
      ? "text-muted-foreground"
      : BigInt(home.change_24h_kobo) < 0n
        ? "text-loss"
        : "text-gain";
  return (
    <section aria-labelledby="total-value-label" className="flex flex-col pt-5">
      <p id="total-value-label" className="text-muted-foreground text-[13px]">
        Total value
      </p>
      <p className="type-app-figure text-heading mt-1 break-words">
        {figure}
        {home.total_kobo === null && <span className="sr-only">not available</span>}
      </p>
      {note !== null && <p className="text-muted-foreground mt-1.5 text-sm">{note}</p>}
      {change !== null && (
        <p className={cn("mt-1.5 text-sm tabular-nums", changeTone)}>
          {change}
        </p>
      )}
      <p className="text-muted-foreground mt-0.5 text-sm tabular-nums">
        Cash {moneyText(home.cash.available_kobo)} available
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SetupGate label="Finish setting up to add money">
          <Button onClick={onAddMoney}>Add money</Button>
        </SetupGate>
        <Button variant="outline" asChild>
          <Link href="/stocks">Invest</Link>
        </Button>
      </div>
      <div className="mt-3">
        <BetaLine notice={home.beta.notice} />
      </div>
    </section>
  );
}
