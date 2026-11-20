"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { appApi, AppApiError } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";
import type { AppEarnProductDto, AppEarnWithdrawPreviewDto } from "@/types/app";
import { formatShares } from "@/utils/format";
import { useIdempotencyKey } from "@/hooks/app/use-idempotency-key";
import { ReviewList } from "@/components/app/money/review-list";
import { PinStep } from "@/components/app/money/pin-step";
import { useCountdown } from "@/components/app/money/use-countdown";
import { BetaLine } from "@/components/app/beta-line";
import { moneyText } from "@/primitives/money-text";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@/primitives";

function asApiError(caught: unknown): AppApiError {
  if (caught instanceof AppApiError) return caught;
  return new AppApiError("Something went wrong. Please try again.", 0, "SOMETHING_WENT_WRONG");
}

// Withdraw from Earn: the preview, then the PIN. The preview is fetched when
// the dialog opens and again only when the customer asks for a new one, so a
// live refetch of the product never swaps the key out from under a retry.
export function LeaveEarnDialog({
  open,
  onChange,
  product,
}: {
  open: boolean;
  onChange: (o: boolean) => void;
  product: AppEarnProductDto;
}) {
  const queryClient = useQueryClient();
  const { key, renew } = useIdempotencyKey();
  const positionId = product.position?.id ?? null;
  const [preview, setPreview] = React.useState<AppEarnWithdrawPreviewDto | null>(null);
  const [step, setStep] = React.useState<"review" | "pin">("review");
  const [stale, setStale] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pinError, setPinError] = React.useState<AppApiError | null>(null);
  const [pending, setPending] = React.useState(false);
  const countdownState = useCountdown(preview !== null ? preview.expires_at : null);
  const expired = stale || countdownState?.done === true;

  const fetchPreview = React.useCallback(async () => {
    if (positionId === null) return;
    setPending(true);
    setError(null);
    try {
      const next = await appApi.earn.withdrawPreview(positionId);
      setPreview(next);
      setStale(false);
      setPinError(null);
      renew();
      setStep("review");
    } catch (caught) {
      setError(asApiError(caught).message);
    }
    setPending(false);
  }, [positionId, renew]);

  React.useEffect(() => {
    if (!open) return;
    setPreview(null);
    setStep("review");
    setStale(false);
    setError(null);
    setPinError(null);
    void fetchPreview();
  }, [open, fetchPreview]);

  async function onPin(pin: string) {
    if (preview === null || positionId === null) return;
    setPending(true);
    setPinError(null);
    try {
      await appApi.earn.withdraw(positionId, { preview_id: preview.preview_id, pin }, key);
      void queryClient.invalidateQueries({ queryKey: ["earn"] });
      void queryClient.invalidateQueries({ queryKey: appKeys.home });
      void queryClient.invalidateQueries({ queryKey: appKeys.automations });
      onChange(false);
    } catch (caught) {
      setPinError(asApiError(caught));
      setPending(false);
    }
  }

  function backToReview() {
    if (pinError?.code === "PRICE_CHANGED") setStale(true);
    setPinError(null);
    setStep("review");
  }

  return (
    <Dialog open={open} onOpenChange={onChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw from Earn</DialogTitle>
          <DialogDescription>What you get back from {product.title}.</DialogDescription>
        </DialogHeader>
        {step === "review" && (
          <div className="flex flex-col gap-4">
            {preview === null && pending && (
              <div className="flex flex-col gap-3" aria-hidden="true">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-2/3" />
              </div>
            )}
            {preview !== null && expired && (
              <>
                <p role="status" className="text-muted-foreground text-sm">
                  This preview expired.
                </p>
                <Button disabled={pending} onClick={() => void fetchPreview()}>
                  {pending ? "Checking…" : "Get a new preview"}
                </Button>
              </>
            )}
            {preview !== null && !expired && (
              <>
                <ReviewList
                  rows={[
                    {
                      label: "You get back",
                      value: `${formatShares(preview.you_get.shares_micro)} of ${product.stock.name} plus ${moneyText(preview.you_get.cash_kobo)}`,
                      emphasis: true,
                    },
                    { label: "Worth about", value: moneyText(preview.value_kobo) },
                  ]}
                />
                {countdownState !== null && (
                  <p className="text-muted-foreground text-sm tabular-nums" suppressHydrationWarning>
                    Held for {countdownState.text}
                  </p>
                )}
                <BetaLine />
                <Button onClick={() => setStep("pin")}>Confirm with PIN</Button>
              </>
            )}
            <p role="status" aria-live="polite" className="text-loss text-sm empty:hidden">
              {error}
            </p>
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
