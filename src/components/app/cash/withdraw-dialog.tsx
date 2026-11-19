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

// Withdraw: amount, review with a held price, then the PIN.
export function WithdrawDialog({
  open,
  onOpenChange,
  availableKobo,
  bankAccount,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  availableKobo: string | null;
  bankAccount: AppBankAccountDto;
}) {
  const router = useRouter();
  const { key, renew } = useIdempotencyKey();
  const [step, setStep] = React.useState<"amount" | "review" | "pin">("amount");
  const [kobo, setKobo] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<AppWithdrawalPreviewDto | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pinError, setPinError] = React.useState<AppApiError | null>(null);
  const [pending, setPending] = React.useState(false);
  const countdownState = useCountdown(preview !== null ? preview.expires_at : null);

  React.useEffect(() => {
    if (open) {
      setStep("amount");
      setKobo(null);
      setPreview(null);
      setError(null);
      setPinError(null);
      renew();
    }
  }, [open, renew]);

  async function onContinue() {
    if (kobo === null || amountCheck(kobo, { availableKobo }) !== "ok") return;
    setPending(true);
    setError(null);
    try {
      const next = await appApi.withdrawals.preview(kobo);
      setPreview(next);
      renew();
      setStep("review");
    } catch (caught) {
      if (caught instanceof AppApiError) setError(caught.message);
      setPending(false);
    }
  }

  async function onPin(pin: string) {
    if (preview === null) return;
    setPending(true);
    setPinError(null);
    try {
      const withdrawal = await appApi.withdrawals.create({ preview_id: preview.preview_id, pin }, key);
      onOpenChange(false);
      router.push(`/activity/wd_${withdrawal.id}`);
    } catch (caught) {
      if (caught instanceof AppApiError) setPinError(caught);
      else setPinError(new AppApiError("Something went wrong. Please try again.", 0, "NETWORK"));
      setPending(false);
    }
  }

  const expired = preview === null ? false : countdownState !== null && countdownState.done;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw</DialogTitle>
          {step === "amount" && (
            <DialogDescription>Money goes to your bank account.</DialogDescription>
          )}
        </DialogHeader>
        {step === "amount" && (
          <div className="mt-2 flex flex-col gap-4">
            <AmountField
              id="withdraw-amount"
              label="Amount"
              kobo={kobo}
              onKoboChange={setKobo}
              availableKobo={availableKobo}
            />
            <div>
              <Button variant="link" size="sm" onClick={() => setKobo(availableKobo)}>
                All available
              </Button>
            </div>
            <Button onClick={() => void onContinue()} disabled={kobo === null || pending}>
              {pending ? "Checking…" : "Continue"}
            </Button>
            {error !== null && (
              <p role="status" aria-live="polite" className="text-loss text-sm">
                {error}
              </p>
            )}
          </div>
        )}
        {step === "review" && preview !== null && (
          <div className="mt-2 flex flex-col gap-4">
            {expired ? (
              <>
                <p role="status" className="text-muted-foreground text-sm">
                  This price expired.
                </p>
                <Button variant="outline" onClick={() => void onContinue()}>
                  Get a new preview
                </Button>
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
                  <p className="text-muted-foreground text-sm" suppressHydrationWarning>
                    Held for {countdownState.text}
                  </p>
                )}
                <BetaLine />
                <Button onClick={() => setStep("pin")}>Confirm with PIN</Button>
              </>
            )}
          </div>
        )}
        {step === "pin" && (
          <div className="mt-2">
            <PinStep
              heading="Confirm with your PIN"
              pending={pending}
              error={pinError}
              onSubmit={(pin) => void onPin(pin)}
              onBack={() => setStep("review")}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
