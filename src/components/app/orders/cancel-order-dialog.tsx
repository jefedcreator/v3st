"use client";

import * as React from "react";

import { appApi, AppApiError } from "@/utils/app-api";
import type { AppOrderDto } from "@/types/app";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/primitives";

// Cancel this order? A confirm modal, nothing more.
export function CancelOrderDialog({
  order,
  open,
  onOpenChange,
}: {
  order: AppOrderDto;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onCancel() {
    setPending(true);
    setError(null);
    try {
      await appApi.orders.cancel(order.id);
      onOpenChange(false);
    } catch (caught) {
      if (caught instanceof AppApiError) setError(caught.message);
      else setError("Something went wrong. Please try again.");
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this order?</DialogTitle>
          <DialogDescription>
            {order.side === "buy" ? "Your cash is released." : "Your shares are released."}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-3 flex flex-col gap-3">
          <Button variant="outline" onClick={() => void onCancel()} disabled={pending}>
            {pending ? "Cancelling…" : "Cancel order"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Keep order
          </Button>
          {error !== null && (
            <p role="status" aria-live="polite" className="text-loss text-sm">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
