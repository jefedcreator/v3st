"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { appApi, AppApiError } from "@/utils/app-api";
import type { AppEarnProductDto, AppEarnWithdrawPreviewDto } from "@/types/app";
import { formatShares } from "@/utils/format";
import { useIdempotencyKey } from "@/hooks/app/use-idempotency-key";
import { ReviewList } from "@/components/app/money/review-list";
import { PinStep } from "@/components/app/money/pin-step";
import { moneyText } from "@/primitives/money-text";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/primitives";

// Withdraw from Earn: the preview, then the PIN.
export function LeaveEarnDialog({
  open,
  onChange,
  product,
}: {
  open: boolean;
  onChange: (o: boolean) => void;
  product: AppEarnProductDto;
}) {
  const router = useRouter();
  const { key, renew } = useIdempotencyKey();
  const [preview, setPreview] = React.useState<AppEarnWithdrawPreviewDto | null>(null);
  const [step, setStep] = React.useState<"review" | "pin">("review");
  const [error, setError] = React.useState<string | null>(null);
  const [pinError, setPinError] = React.useState<AppApiError | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setStep("review");
    setPreview(null);
    setError(null);
    setPinError(null);
    renew();
    if (product.position === null) return;
    void (async () => {
      setPending(true);
      try {
        const next = await appApi.earn.withdrawPreview(product.position!.id);
        setPreview(next);
        renew();
      } catch (caught) {
        if (caught instanceof AppApiError) setError(caught.message);
        else setError("Something went wrong. Please try again.");
      }
      setPending(false);
    })();
  }, [open, product.position, renew]);

  async function onPin(pin: string) {
    if (preview === null || product.position === null) return;
    setPending(true);
    setPinError(null);
    try {
      await appApi.earn.withdraw(
        product.position.id,
        { preview_id: preview.preview_id, pin },
        key,
      );
      onChange(false);
      router.refresh();
    } catch (caught) {
      if (caught instanceof AppApiError) setPinError(caught);
      else setPinError(new AppApiError("Something went wrong. Please try again.", 0, "NETWORK"));
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw from Earn</DialogTitle>
        </DialogHeader>
        {step === "review" && (
          <div className="mt-2 flex flex-col gap-4">
            {error !== null && (
              <p role="status" aria-live="polite" className="text-loss text-sm">
                {error}
              </p>
            )}
            {preview === null && pending && <p className="text-muted-foreground text-sm">Loading…</p>}
            {preview !== null && (
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
                <PinStep
                  heading="Confirm with your PIN"
                  pending={pending}
                  error={pinError}
                  onSubmit={(pin) => void onPin(pin)}
                  onBack={() => onChange(false)}
                  backLabel="Close"
                />
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
