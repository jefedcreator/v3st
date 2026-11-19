"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { appApi, AppApiError } from "@/utils/app-api";
import type { MoneyLimits } from "@/types/app-ui";
import { AmountField } from "@/components/app/money/amount-field";
import { amountCheck } from "@/components/app/money/amount";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/primitives";
import { useIdempotencyKey } from "@/hooks/app/use-idempotency-key";

// Add money: one step, then the transfer details live on the receipt.
export function AddMoneyDialog({
  open,
  onOpenChange,
  limits,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  limits: MoneyLimits;
}) {
  const router = useRouter();
  const { key, renew } = useIdempotencyKey();
  const [kobo, setKobo] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setKobo(null);
      setError(null);
      renew();
    }
  }, [open, renew]);

  async function onContinue() {
    if (kobo === null || amountCheck(kobo, {
      minKobo: limits.depositMinKobo,
      maxKobo: limits.depositMaxKobo,
    }) !== "ok") return;
    setPending(true);
    setError(null);
    try {
      const deposit = await appApi.cash.createDeposit(kobo, key);
      onOpenChange(false);
      router.push(`/activity/dep_${deposit.id}`);
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
          <DialogTitle>Add money</DialogTitle>
          <DialogDescription>
            You'll get bank details to send a transfer from your own account.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-4">
          <AmountField
            id="add-money-amount"
            label="Amount"
            kobo={kobo}
            onKoboChange={setKobo}
            minKobo={limits.depositMinKobo}
            maxKobo={limits.depositMaxKobo}
          />
          <Button
            onClick={() => void onContinue()}
            disabled={
              kobo === null ||
              amountCheck(kobo, {
                minKobo: limits.depositMinKobo,
                maxKobo: limits.depositMaxKobo,
              }) !== "ok" ||
              pending
            }
          >
            {pending ? "Getting bank details…" : "Continue"}
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
