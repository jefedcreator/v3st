"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { appApi, AppApiError } from "@/utils/app-api";
import type { AppEarnPreviewDto, AppEarnProductDto } from "@/types/app";
import { formatNaira, formatShares } from "@/utils/format";
import { useIdempotencyKey } from "@/hooks/app/use-idempotency-key";
import { AmountField } from "@/components/app/money/amount-field";
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
  DialogHeader,
  DialogTitle,
  Label,
} from "@/primitives";
import { joinReady } from "./earn";

// Join Earn: amount, review, then the risks and the PIN. The risks document
// shows inline in the last step; a third modal is never opened.
export function JoinEarnDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product: AppEarnProductDto;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { key, renew } = useIdempotencyKey();
  const [step, setStep] = React.useState<"amount" | "review" | "risks">("amount");
  const [kobo, setKobo] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<AppEarnPreviewDto | null>(null);
  const [acceptedRisk, setAcceptedRisk] = React.useState(false);
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const countdownState = useCountdown(preview !== null && step === "review" ? preview.expires_at : null);

  React.useEffect(() => {
    if (open) {
      setStep("amount");
      setKobo(null);
      setPreview(null);
      setAcceptedRisk(false);
      setPin("");
      setError(null);
      renew();
    }
  }, [open, renew]);

  async function runPreview() {
    if (kobo === null) return;
    setPending(true);
    setError(null);
    try {
      const next = await appApi.earn.preview(product.id, kobo);
      setPreview(next);
      renew();
      setStep("review");
    } catch (caught) {
      if (caught instanceof AppApiError) setError(caught.message);
      else setError("Something went wrong. Please try again.");
    }
    setPending(false);
  }

  async function onConfirm() {
    if (preview === null) return;
    setPending(true);
    setError(null);
    try {
      await appApi.earn.join(
        product.id,
        { preview_id: preview.preview_id, pin, accepted_risk_version: preview.risk_document.version },
        key,
      );
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ["earn"] });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
      router.refresh();
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
          <DialogTitle>{product.title}</DialogTitle>
        </DialogHeader>
        {step === "amount" && (
          <div className="mt-2 flex flex-col gap-4">
            <AmountField
              id="earn-amount"
              label="Amount"
              kobo={kobo}
              onKoboChange={setKobo}
              minKobo={product.minimum_kobo}
            />
            <Button disabled={kobo === null || pending} onClick={() => void runPreview()}>
              {pending ? "Getting a preview…" : "Continue"}
            </Button>
          </div>
        )}
        {step === "review" && preview !== null && (
          <div className="mt-2 flex flex-col gap-4">
            <ReviewList
              rows={[
                { label: "You add", value: formatNaira(preview.you_add_kobo), emphasis: true },
                {
                  label: `In ${product.stock.name}`,
                  value: formatShares(preview.split.shares_micro),
                },
                { label: "In cash", value: formatNaira(preview.split.cash_kobo) },
                ...preview.fees.map((fee) => ({
                  label: fee.label,
                  value:
                    fee.kobo === null || fee.note !== null ? (fee.note ?? "—") : formatNaira(fee.kobo),
                })),
              ]}
            />
            <p className="text-muted-foreground text-sm">{preview.automation}</p>
            {countdownState !== null && (
              <p className="text-muted-foreground text-sm" suppressHydrationWarning>
                Held for {countdownState.text}
              </p>
            )}
            <BetaLine />
            <Button onClick={() => setStep("risks")}>Continue</Button>
          </div>
        )}
        {step === "risks" && preview !== null && (
          <div className="mt-2 flex flex-col gap-4">
            <div
              className="focus-visible:outline-ring bg-surface max-h-[40dvh] overflow-y-auto rounded-md border border-stroke p-4 focus-visible:outline-2 focus-visible:outline-offset-3"
              tabIndex={0}
              role="region"
              aria-label="Earn risks"
            >
              <DocumentContent slug="earn-risks" />
            </div>
            <Label
              htmlFor="accept-earn-risks"
              className="flex min-h-11 items-start gap-3 font-normal"
            >
              <Checkbox
                id="accept-earn-risks"
                checked={acceptedRisk}
                onCheckedChange={(checked) => setAcceptedRisk(checked === true)}
              />
              I&apos;ve read and accept the Earn risks (version {preview.risk_document.version})
            </Label>
            <PinInput id="earn-pin" label="Your PIN" value={pin} onChange={setPin} />
            <Button
              disabled={!joinReady(acceptedRisk, pin) || pending}
              onClick={() => void onConfirm()}
            >
              {pending ? "Joining…" : "Confirm"}
            </Button>
          </div>
        )}
        {error !== null && (
          <p role="status" aria-live="polite" className="text-loss text-sm">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
