"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { appApi, AppApiError } from "@/utils/app-api";
import type { AppBankAccountDto, AppWithdrawalPreviewDto } from "@/types/app";
import { formatNaira } from "@/utils/format";
import { useIdempotencyKey } from "@/hooks/app/use-idempotency-key";
import { AmountField } from "@/components/app/money/amount-field";
import { amountCheck } from "@/components/app/money/amount";
import { ReviewList } from "@/components/app/money/review-list";
import { PinStep } from "@/components/app/money/pin-step";
import { useCountdown } from "@/components/app/money/use-countdown";
import { BetaLine } from "@/components/app/beta-line";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/primitives";

function asApiError(caught: unknown): AppApiError {
  if (caught instanceof AppApiError) return caught;
  return new AppApiError("Something went wrong. Please try again.", 0, "SOMETHING_WENT_WRONG");
}

// Withdraw: amount, review with a held preview, then the PIN. The
// Idempotency-Key is renewed only when a new preview is fetched, so every
// retry of one review sends the same key.
export function WithdrawDialog({
  open,
  onOpenChange,
  availableKobo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  availableKobo: string | null;
  // The saved account; the review shows the preview's own `to`.
  bankAccount: AppBankAccountDto;
}) {
  const router = useRouter();
  const { key, renew } = useIdempotencyKey();
  const [step, setStep] = React.useState<"amount" | "review" | "pin">("amount");
  const [kobo, setKobo] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<AppWithdrawalPreviewDto | null>(null);
  const [stale, setStale] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pinError, setPinError] = React.useState<AppApiError | null>(null);
  const [pending, setPending] = React.useState(false);
  const countdownState = useCountdown(preview !== null ? preview.expires_at : null);

  React.useEffect(() => {
    if (open) {
      setStep("amount");
      setKobo(null);
      setPreview(null);
      setStale(false);
      setError(null);
      setPinError(null);
      setPending(false);
    }
  }, [open]);

  const amountOk = amountCheck(kobo, { availableKobo }) === "ok";
  const expired = stale || countdownState?.done === true;

  async function fetchPreview() {
    if (kobo === null || !amountOk) return;
    setPending(true);
    setError(null);
    try {
      const next = await appApi.withdrawals.preview(kobo);
      setPreview(next);
      setStale(false);
      setPinError(null);
      renew();
      setStep("review");
    } catch (caught) {
      setError(asApiError(caught).message);
    }
    setPending(false);
  }

  async function onPin(pin: string) {
    if (preview === null) return;
    setPending(true);
    setPinError(null);
    try {
      const withdrawal = await appApi.withdrawals.create(
        { preview_id: preview.preview_id, pin },
        key,
      );
      onOpenChange(false);
      router.push(`/activity/wd_${withdrawal.id}`);
    } catch (caught) {
      setPinError(asApiError(caught));
      setPending(false);
    }
  }

  // PinStep calls this for Back, and for a changed or expired preview, which
  // the review then offers to replace.
  function backToReview() {
    if (pinError?.code === "PRICE_CHANGED") setStale(true);
    setPinError(null);
    setStep("review");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw</DialogTitle>
          <DialogDescription>Money goes to your bank account.</DialogDescription>
        </DialogHeader>
        {step === "amount" && (
          <div className="flex flex-col gap-4">
            <AmountField
              id="withdraw-amount"
              label="Amount"
              kobo={kobo}
              onKoboChange={setKobo}
              availableKobo={availableKobo}
            />
            {availableKobo !== null && availableKobo !== "0" && (
              <Button
                variant="link"
                size="sm"
                className="self-start px-0"
                onClick={() => setKobo(availableKobo)}
              >
                All available
              </Button>
            )}
            <Button onClick={() => void fetchPreview()} disabled={!amountOk || pending}>
              {pending ? "Checking…" : "Continue"}
            </Button>
            <p role="status" aria-live="polite" className="text-loss text-sm empty:hidden">
              {error}
            </p>
          </div>
        )}
        {step === "review" && preview !== null && (
          <div className="flex flex-col gap-4">
            {expired ? (
              <>
                <p role="status" className="text-muted-foreground text-sm">
                  This preview expired.
                </p>
                <Button disabled={pending} onClick={() => void fetchPreview()}>
                  {pending ? "Checking…" : "Get a new preview"}
                </Button>
                <p role="status" aria-live="polite" className="text-loss text-sm empty:hidden">
                  {error}
                </p>
              </>
            ) : (
              <>
                <ReviewList
                  rows={[
                    { label: "Amount", value: formatNaira(preview.amount_kobo) },
                    { label: "Fee", value: formatNaira(preview.fee_kobo) },
                    {
                      label: "You receive",
                      value: formatNaira(preview.you_receive_kobo),
                      emphasis: true,
                    },
                    {
                      label: "To",
                      value: `${preview.to.bank_name} ••${preview.to.account_ending} · ${preview.to.account_name}`,
                    },
                  ]}
                />
                {countdownState !== null && (
                  <p className="text-muted-foreground text-sm tabular-nums" suppressHydrationWarning>
                    Held for {countdownState.text}
                  </p>
                )}
                <BetaLine />
                <Button onClick={() => setStep("pin")}>Confirm with PIN</Button>
                <Button variant="ghost" onClick={() => setStep("amount")}>
                  Change amount
                </Button>
              </>
            )}
          </div>
        )}
        {step === "pin" && (
          <PinStep
            heading="Confirm with your PIN"
            pending={pending}
            error={pinError}
            onSubmit={(pin) => void onPin(pin)}
            onBack={backToReview}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
