"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { appApi } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";
import type { AppActivityDetailDto, AppDepositDto } from "@/types/app";
import { cn } from "@/utils/cn";
import { BetaLine } from "@/components/app/beta-line";
import { PageHeader } from "@/components/app/page-header";
import { Timeline } from "@/components/app/timeline";
import { TransferCard } from "@/components/app/money/transfer-card";
import { CopyButton, KeyValue, Money } from "@/primitives";
import { depositIdOf, isUnpaidTransfer, progressLabel } from "./activity-groups";

// One receipt. An unpaid transfer puts its bank details first, because
// finishing it is this page's job until the money arrives.
export function ReceiptPage({
  item,
  deposit,
}: {
  item: AppActivityDetailDto;
  deposit: AppDepositDto | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const payTo = isUnpaidTransfer(item) && deposit !== null ? deposit.pay_to : null;

  async function completeBetaDeposit() {
    await appApi.beta.completeDeposit(depositIdOf(item.id));
    void queryClient.invalidateQueries({ queryKey: appKeys.activityItem(item.id) });
    void queryClient.invalidateQueries({ queryKey: ["deposit"] });
    void queryClient.invalidateQueries({ queryKey: appKeys.cash });
    void queryClient.invalidateQueries({ queryKey: appKeys.home });
    router.refresh();
  }

  const progress = progressLabel(item.status);
  const bankRows: { label: string; value: string }[] = [];
  if (item.bank !== null) {
    bankRows.push({
      label: "Bank",
      value: `${item.bank.bank_name} ••${item.bank.account_ending} · ${item.bank.account_name}`,
    });
  }
  if (item.bank_reference !== null) {
    bankRows.push({ label: "Bank reference", value: item.bank_reference });
  }

  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader title={item.title} back={{ href: "/activity", label: "Activity" }} />
      <div className="flex flex-col gap-1">
        <Money
          kobo={item.amount_kobo}
          direction={item.direction}
          className="type-app-amount text-heading"
        />
        <p className={cn("text-sm", item.status === "failed" ? "text-loss" : "text-muted-foreground")}>
          {progress ?? "Done"}
        </p>
      </div>
      {payTo !== null && (
        <TransferCard payTo={payTo} onCompleteBeta={completeBetaDeposit} />
      )}
      {item.lines.length > 0 && (
        <KeyValue items={item.lines.map((line) => ({ label: line.label, value: line.value }))} />
      )}
      {item.timeline.length > 0 && <Timeline steps={item.timeline} />}
      {bankRows.length > 0 && <KeyValue items={bankRows} />}
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-1 text-sm">
        Support reference <span className="text-ink tabular-nums">{item.reference}</span>
        <CopyButton value={item.reference} label="Copy support reference" />
      </p>
      <BetaLine />
    </div>
  );
}
