"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { appApi, AppApiError } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";
import { settingsHref } from "@/utils/app-paths";
import type { AppEarnPreviewDto, AppEarnProductDto } from "@/types/app";
import { formatNaira, formatShares } from "@/utils/format";
import { useIdempotencyKey } from "@/hooks/app/use-idempotency-key";
import { AmountField } from "@/components/app/money/amount-field";
import { amountCheck } from "@/components/app/money/amount";
import { pinErrorAction } from "@/components/app/money/money-job";
import { ReviewList } from "@/components/app/money/review-list";
import { useCountdown } from "@/components/app/money/use-countdown";
import { PinInput } from "@/components/app/pin/pin-input";
import { BetaLine } from "@/components/app/beta-line";
import { DocumentContent } from "@/components/app/documents/document-dialog";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
} from "@/primitives";
import { joinReady } from "./earn";

function asApiError(caught: unknown): AppApiError {
  if (caught instanceof AppApiError) return caught;
  return new AppApiError("Something went wrong. Please try again.", 0, "SOMETHING_WENT_WRONG");
}

// Join Earn: amount, review, then the risks and the PIN. The risks document
// shows inline in the last step; a second modal is never opened on top.
export function JoinEarnDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product: AppEarnProductDto;
}) {
  const queryClient = useQueryClient();
  const { key, renew } = useIdempotencyKey();
  const [step, setStep] = React.useState<"amount" | "review" | "risks">("amount");
  const [kobo, setKobo] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<AppEarnPreviewDto | null>(null);
  const [stale, setStale] = React.useState(false);
  const [acceptedRisk, setAcceptedRisk] = React.useState(false);
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState<{ message: string; locked: boolean } | null>(null);
  const [pending, setPending] = React.useState(false);
  const countdownState = useCountdown(preview !== null ? preview.expires_at : null);

  React.useEffect(() => {
    if (open) {
      setStep("amount");
      setKobo(null);
      setPreview(null);
      setStale(false);
      setAcceptedRisk(false);
      setPin("");
      setError(null);
      setPending(false);
    }
  }, [open]);

  const amountOk = amountCheck(kobo, { minKobo: product.minimum_kobo }) === "ok";
  const expired = stale || countdownState?.done === true;

  async function fetchPreview() {
    if (kobo === null || !amountOk) return;
    setPending(true);
    setError(null);
    try {
      const next = await appApi.earn.preview(product.id, kobo);
      setPreview(next);
      setStale(false);
      setPin("");
      renew();
      setStep("review");
    } catch (caught) {
      setError({ message: asApiError(caught).message, locked: false });
    }
    setPending(false);
  }

  async function onConfirm() {
    if (preview === null || !joinReady(acceptedRisk, pin)) return;
    setPending(true);
    setError(null);
    try {
      await appApi.earn.join(
        product.id,
        { preview_id: preview.preview_id, pin, accepted_risk_version: preview.risk_document.version },
        key,
      );
      void queryClient.invalidateQueries({ queryKey: ["earn"] });
      void queryClient.invalidateQueries({ queryKey: appKeys.home });
      void queryClient.invalidateQueries({ queryKey: appKeys.automations });
      onOpenChange(false);
    } catch (caught) {
      const failure = asApiError(caught);
      const action = pinErrorAction(failure.code);
      setPending(false);
      if (action === "new_price") {
        // The held split is gone: back to the review for a new one.
        setStale(true);
        setStep("review");
        return;
      }
      if (action === "clear_pin") setPin("");
      setError({ message: failure.message, locked: action === "locked" });
    }
  }

  const reviewRows: { label: string; value: React.ReactNode; emphasis?: boolean }[] = [];
  if (preview !== null) {
    reviewRows.push({ label: "You add", value: formatNaira(preview.you_add_kobo), emphasis: true });
    reviewRows.push({
      label: `In ${product.stock.name}`,
      value: formatShares(preview.split.shares_micro),
    });
    reviewRows.push({ label: "In cash", value: formatNaira(preview.split.cash_kobo) });
    for (const fee of preview.fees) {
      reviewRows.push({
        label: fee.label,
        value: fee.kobo === null ? (fee.note ?? "—") : formatNaira(fee.kobo),
      });
    }
  }

  const errorLine = (
    <p role="status" aria-live="polite" className="text-loss text-sm empty:hidden">
      {error === null ? null : error.message}
      {error !== null && error.locked && (
        <>
          {" "}
          <a className="text-gain underline underline-offset-4" href={settingsHref("reset-pin")}>
            Reset your PIN
          </a>
        </>
      )}
    </p>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product.title}</DialogTitle>
          <DialogDescription>
            {step === "amount" && "How much to add."}
            {step === "review" && "What you add, and where it goes."}
            {step === "risks" && "Read the risks, then confirm with your PIN."}
          </DialogDescription>
        </DialogHeader>
        {step === "amount" && (
          <div className="flex flex-col gap-4">
            <AmountField
              id="earn-amount"
              label="Amount"
              kobo={kobo}
              onKoboChange={setKobo}
              minKobo={product.minimum_kobo}
            />
            <Button disabled={!amountOk || pending} onClick={() => void fetchPreview()}>
              {pending ? "Getting a preview…" : "Continue"}
            </Button>
            {errorLine}
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
                  {pending ? "Getting a preview…" : "Get a new preview"}
                </Button>
                {errorLine}
              </>
            ) : (
              <>
                <ReviewList rows={reviewRows} />
                <p className="text-muted-foreground text-sm">{preview.automation}</p>
                {countdownState !== null && (
                  <p className="text-muted-foreground text-sm tabular-nums" suppressHydrationWarning>
                    Held for {countdownState.text}
                  </p>
                )}
                <BetaLine />
                <Button onClick={() => setStep("risks")}>Continue</Button>
                <Button variant="ghost" onClick={() => setStep("amount")}>
                  Change amount
                </Button>
              </>
            )}
          </div>
        )}
        {step === "risks" && preview !== null && (
          <div className="flex flex-col gap-4">
            <div
              className="focus-visible:outline-ring bg-void max-h-[40dvh] overflow-y-auto rounded-md border border-stroke p-4 focus-visible:outline-2 focus-visible:outline-offset-3"
              tabIndex={0}
              role="region"
              aria-label="Earn risks"
            >
              <DocumentContent slug="earn-risks" />
            </div>
            <Label htmlFor="accept-earn-risks" className="flex min-h-11 items-start gap-3 font-normal leading-snug">
              <Checkbox
                id="accept-earn-risks"
                className="mt-0.5"
                checked={acceptedRisk}
                onCheckedChange={(checked) => setAcceptedRisk(checked === true)}
              />
              I&apos;ve read and accept the Earn risks (version {preview.risk_document.version})
            </Label>
            <PinInput
              id="earn-pin"
              label="Your PIN"
              value={pin}
              onChange={setPin}
              invalid={error !== null}
              describedBy={error !== null ? "earn-pin-error" : undefined}
            />
            <Button
              disabled={!joinReady(acceptedRisk, pin) || pending || expired}
              onClick={() => void onConfirm()}
            >
              {pending ? "Joining…" : "Confirm"}
            </Button>
            <div id="earn-pin-error">{errorLine}</div>
            {expired && (
              <p role="status" className="text-muted-foreground text-sm">
                This preview expired. Go back for a new one.
              </p>
            )}
            <Button variant="ghost" onClick={() => setStep("review")}>
              Back
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
