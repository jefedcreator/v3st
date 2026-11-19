"use client";

import Link from "next/link";
import * as React from "react";

import { formatLagosTime } from "@/utils/format";
import { settingsHref } from "@/utils/app-paths";
import type { AppBankAccountDto, AppCashDto } from "@/types/app";
import type { MoneyLimits } from "@/types/app-ui";
import { SetupGate } from "@/components/app/setup-gate";
import { useBankAccountQuery, useCashQuery } from "@/hooks/app/use-cash";
import { moneyText } from "@/primitives/money-text";
import { Button, KeyValue, Money } from "@/primitives";
import { AddMoneyDialog } from "./add-money-dialog";
import { WithdrawDialog } from "./withdraw-dialog";

// The cash page: what you have, where withdrawals go, and the two jobs.
export function CashPage({
  cash,
  bankAccount: initialBank,
  limits,
}: {
  cash: AppCashDto;
  bankAccount: AppBankAccountDto | null;
  limits: MoneyLimits;
}) {
  const { data } = useCashQuery(cash);
  const d = data ?? cash;
  const bankQuery = useBankAccountQuery(initialBank);
  const bankAccount = bankQuery.data ?? null;
  const [addOpen, setAddOpen] = React.useState(false);
  const [withdrawOpen, setWithdrawOpen] = React.useState(false);

  const items = [
    { label: "On hold", value: <Money kobo={d.on_hold_kobo} /> },
    { label: "Incoming", value: <Money kobo={d.incoming_kobo} /> },
  ];

  return (
    <div className="flex flex-col gap-6 pt-4">
      <h1 className="type-app-title text-heading">Cash</h1>
      <section aria-label="Available" className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">Available</p>
        <p className="type-app-figure text-heading">
          {moneyText(d.available_kobo)}
          {d.available_kobo === null && <span className="sr-only">not available</span>}
        </p>
      </section>
      <KeyValue items={items} />
      <p className="text-subtle text-sm">
        Updated <time dateTime={d.as_of}>{formatLagosTime(d.as_of)}</time>
      </p>
      <p className="text-ink text-[15px]">
        {bankAccount === null
          ? "No bank account yet"
          : `${bankAccount.bank_name} ••${bankAccount.account_ending} · ${bankAccount.account_name}`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SetupGate>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setAddOpen(true)}>Add money</Button>
            {bankAccount === null ? (
              <Button variant="outline" asChild>
                <Link href={settingsHref("bank")}>Add your bank account</Link>
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setWithdrawOpen(true)}>
                Withdraw
              </Button>
            )}
          </div>
        </SetupGate>
      </div>
      <p>
        <Link href="/activity" className="text-gain text-[15px] underline-offset-4 hover:underline">
          See all activity
        </Link>
      </p>
      <AddMoneyDialog open={addOpen} onOpenChange={setAddOpen} limits={limits} />
      {bankAccount !== null && (
        <WithdrawDialog
          open={withdrawOpen}
          onOpenChange={setWithdrawOpen}
          availableKobo={d.available_kobo}
          bankAccount={bankAccount}
        />
      )}
    </div>
  );
}
