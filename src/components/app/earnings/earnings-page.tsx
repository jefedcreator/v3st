"use client";

import Link from "next/link";
import * as React from "react";

import type { AppEarningsDto } from "@/types/app";
import { formatLagosDay, formatNaira } from "@/utils/format";
import { useEarningsQuery } from "@/hooks/app/use-earn";
import { Button, Money } from "@/primitives";
import { choiceLine, minimumPayoutLine, outcomeLabel } from "./earnings";
import { EarningsChoiceDialog } from "./earnings-choice-dialog";

// What you've earned and what happens on Friday.
export function EarningsPage({ earnings: initial }: { earnings: AppEarningsDto }) {
  const { data: earnings } = useEarningsQuery(initial);
  const [open, setOpen] = React.useState(false);
  const choice = choiceLine(earnings);
  const empty = earnings.weeks.length === 0 && earnings.total_earned_kobo === "0";

  return (
    <div className="flex flex-col gap-6 pt-4">
      <h1 className="type-app-title text-heading">Earnings</h1>
      <section aria-label="Total earned" className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">Total earned</p>
        <p className="type-app-figure text-heading">
          <Money kobo={earnings.total_earned_kobo} />
        </p>
        <p className="text-muted-foreground text-sm">
          This week {formatNaira(earnings.this_week_kobo)}
        </p>
        <p className="text-muted-foreground text-sm">
          Next payout {formatLagosDay(earnings.next_payout_on)}
        </p>
      </section>
      {choice !== null ? (
        <p className="flex items-center gap-3 text-[15px]">
          {choice}{" "}
          <button
            type="button"
            className="text-gain underline-offset-4 hover:underline"
            onClick={() => setOpen(true)}
          >
            Change
          </button>
        </p>
      ) : (
        <Button onClick={() => setOpen(true)}>Choose what happens to your earnings</Button>
      )}
      <p className="text-subtle text-sm">{minimumPayoutLine(earnings.minimum_payout_kobo)}</p>
      {earnings.limits.map((line) => (
        <p key={line} className="text-subtle text-sm">
          {line}
        </p>
      ))}
      {empty && (
        <p className="text-muted-foreground text-sm">
          No earnings yet. Earn pays out on Fridays when there&apos;s something to pay.{" "}
          <Link href="/earn" className="text-gain underline-offset-4 hover:underline">
            See Earn
          </Link>
        </p>
      )}
      {earnings.weeks.length > 0 && (
        <ol className="flex flex-col gap-4">
          {earnings.weeks.map((week) => (
            <li key={week.week_of} className="flex flex-col gap-0.5 border-b border-stroke pb-4">
              <span className="text-ink text-[15px]">Week of {formatLagosDay(week.week_of)}</span>
              <Money className="text-ink text-sm" kobo={week.earned_kobo} />
              <span className="text-muted-foreground text-sm">{outcomeLabel(week.outcome)}</span>
              <span className="text-subtle text-sm">{week.detail}</span>
            </li>
          ))}
        </ol>
      )}
      <EarningsChoiceDialog
        open={open}
        onOpenChange={setOpen}
        earnings={earnings}
      />
    </div>
  );
}
