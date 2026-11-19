"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { appApi } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";
import type { AppActivityDetailDto, AppDepositDto } from "@/types/app";
import { moneyText } from "@/primitives/money-text";
import { BetaLine } from "@/components/app/beta-line";
import { PageHeader } from "@/components/app/page-header";
import { Timeline } from "@/components/app/timeline";
import { TransferCard } from "@/components/app/money/transfer-card";
import { CopyButton, KeyValue } from "@/primitives";
import { depositIdOf, isUnpaidTransfer, progressLabel } from "./activity-groups";

export function ReceiptPage({
  item,
  deposit,
}: {
  item: AppActivityDetailDto;
  deposit: AppDepositDto | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const showTransfer =
    isUnpaidTransfer(item) && deposit !== null && deposit.pay_to !== null;

  async function completeBetaDeposit() {
    const id = depositIdOf(item.id);
    await appApi.beta.completeDeposit(id);
    void queryClient.invalidateQueries({ queryKey: appKeys.activityItem(item.id) });
    void queryClient.invalidateQueries({ queryKey: ["deposit"] });
    void queryClient.invalidateQueries({ queryKey: appKeys.cash });
    void queryClient.invalidateQueries({ queryKey: appKeys.home });
    router.refresh();
  }

  const progress = progressLabel(item.status);

  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader title="Receipt" back={{ href: "/activity", label: "Activity" }} />
      <div className="flex flex-col gap-1">
        <h2 className="type-app-heading text-heading">{item.title}</h2>
        <p className="type-app-amount text-ink">
          {moneyText(item.amount_kobo, item.direction === "none" ? "none" : item.direction)}
        </p>
        {item.amount_kobo === null && <span className="sr-only">Amount not available</span>}
        {progress !== null && <p className="text-muted-foreground text-sm">{progress}</p>}
      </div>
      {item.lines.length > 0 && (
        <KeyValue items={item.lines.map((line) => ({ label: line.label, value: line.value }))} />
      )}
      {item.timeline.length > 0 && <Timeline steps={item.timeline} />}
      {item.bank !== null && (
        <p className="text-muted-foreground text-sm">
          {item.bank.bank_name} ••{item.bank.account_ending} · {item.bank.account_name}
        </p>
      )}
      {item.bank_reference !== null && <p className="text-muted-foreground text-sm">{item.bank_reference}</p>}
      <p className="text-muted-foreground flex items-center text-sm">
        Support reference {item.reference}
        <CopyButton value={item.reference} label="Copy support reference" />
      </p>
      {showTransfer && deposit !== null && deposit.pay_to !== null && (
        <TransferCard payTo={deposit.pay_to} onCompleteBeta={completeBetaDeposit} />
      )}
      <BetaLine />
    </div>
  );
}
