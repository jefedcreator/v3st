"use client";

import * as React from "react";

import type { AppOrderDto } from "@/types/app";
import { formatLagosDateTime, formatNaira, formatShares } from "@/utils/format";
import { PageHeader } from "@/components/app/page-header";
import { Timeline } from "@/components/app/timeline";
import { TransferCard } from "@/components/app/money/transfer-card";
import { Button, CopyButton, KeyValue, Money } from "@/primitives";
import { useOrderActions, useOrderQuery } from "@/hooks/app/use-orders";
import { tradeTitle } from "@/components/app/trade/trade";
import { CancelOrderDialog } from "./cancel-order-dialog";

// Track one order: amount, shares, price, the timeline and the transfer.
export function OrderPage({ order: initial }: { order: AppOrderDto }) {
  const { data: order } = useOrderQuery(initial.id, initial);
  const { completeTransfer } = useOrderActions(order.id);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [transferError, setTransferError] = React.useState<string | null>(null);

  const rows = [
    { label: "Amount", value: formatNaira(order.amount_kobo ?? "0") },
    { label: "Shares", value: order.shares_micro === null ? "—" : formatShares(order.shares_micro) },
    { label: "Price", value: <Money kobo={order.price_kobo} /> },
    { label: "Placed", value: formatLagosDateTime(order.created_at) },
  ];
  if (order.completed_at !== null) {
    rows.push({ label: "Completed", value: formatLagosDateTime(order.completed_at) });
  }

  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader
        title={tradeTitle(order.side, order.stock.name)}
        back={{ href: `/stocks/${order.stock.id}`, label: order.stock.name }}
      />
      <section className="flex flex-col gap-1">
        <h2 className="type-app-heading text-heading">{order.title}</h2>
        <p className="text-muted-foreground text-sm">{order.detail}</p>
      </section>
      <KeyValue items={rows} />
      {order.timeline.length > 0 && <Timeline steps={order.timeline} />}
      {order.status === "waiting_for_payment" && order.pay_to !== null && (
        <TransferCard
          payTo={order.pay_to}
          onCompleteBeta={async () => {
            try {
              await completeTransfer();
              setTransferError(null);
            } catch {
              setTransferError("That didn't go through. Please try again.");
            }
          }}
        />
      )}
      {order.valid_until !== null && (
        <p className="text-muted-foreground text-sm">
          Valid until {formatLagosDateTime(order.valid_until)}
        </p>
      )}
      <p className="text-muted-foreground flex items-center gap-1 text-sm">
        Support reference {order.reference}
        <CopyButton value={order.reference} label="Copy support reference" />
      </p>
      {order.can_cancel && (
        <div>
          <Button variant="outline" onClick={() => setCancelOpen(true)}>
            Cancel order
          </Button>
        </div>
      )}
      <CancelOrderDialog order={order} open={cancelOpen} onOpenChange={setCancelOpen} />
      {transferError !== null && (
        <p role="status" aria-live="polite" className="text-loss text-sm">
          {transferError}
        </p>
      )}
    </div>
  );
}
