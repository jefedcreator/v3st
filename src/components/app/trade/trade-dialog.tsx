"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { appApi, AppApiError, type OrderPreviewBody } from "@/utils/app-api";
import type { AppOrderPreviewDto, AppStockDetailDto } from "@/types/app";
import { formatNaira, formatShares } from "@/utils/format";
import { useIdempotencyKey } from "@/hooks/app/use-idempotency-key";
import { useCashQuery } from "@/hooks/app/use-cash";
import { AmountField } from "@/components/app/money/amount-field";
import { amountCheck } from "@/components/app/money/amount";
import { PinStep } from "@/components/app/money/pin-step";
import { ReviewList } from "@/components/app/money/review-list";
import { useCountdown } from "@/components/app/money/use-countdown";
import { BetaLine } from "@/components/app/beta-line";
import { moneyText } from "@/primitives/money-text";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
} from "@/primitives";
import { defaultPayWith, executesSentence, tradeTitle } from "./trade";

type PayWith = "cash" | "bank_transfer";

function asApiError(caught: unknown): AppApiError {
  if (caught instanceof AppApiError) return caught;
  return new AppApiError("Something went wrong. Please try again.", 0, "SOMETHING_WENT_WRONG");
}

// The trade job: amount (or Sell all), review, PIN. One Dialog, never a
// second modal on top. The Idempotency-Key is renewed only with a new
// preview, so retrying a dropped Confirm can never place a second order.
export function TradeDialog({
  open,
  onOpenChange,
  side,
  stock,
  minKobo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  side: "buy" | "sell";
  stock: AppStockDetailDto;
  minKobo: string;
}) {
  const router = useRouter();
  const { key, renew } = useIdempotencyKey();
  const { data: cash } = useCashQuery();
  const [step, setStep] = React.useState<"amount" | "review" | "pin">("amount");
  const [kobo, setKobo] = React.useState<string | null>(null);
  const [sellAll, setSellAll] = React.useState(false);
  const [chosenPayWith, setChosenPayWith] = React.useState<PayWith | null>(null);
  const [preview, setPreview] = React.useState<AppOrderPreviewDto | null>(null);
  const [stale, setStale] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [pinError, setPinError] = React.useState<AppApiError | null>(null);
  const [pending, setPending] = React.useState(false);
  const countdownState = useCountdown(preview !== null ? preview.expires_at : null);

  React.useEffect(() => {
    if (open) {
      setStep("amount");
      setKobo(null);
      setSellAll(false);
      setChosenPayWith(null);
      setPreview(null);
      setStale(false);
      setPreviewError(null);
      setPinError(null);
      setPending(false);
    }
  }, [open]);

  // Cash pays when it covers the amount, until the customer picks for
  // themselves.
  const availableKobo = cash?.available_kobo ?? null;
  const payWith: PayWith = chosenPayWith ?? defaultPayWith(availableKobo, kobo);
  const amountOk = sellAll || amountCheck(kobo, { minKobo }) === "ok";
  const expired = stale || countdownState?.done === true;

  function previewBody(): OrderPreviewBody {
    const body: OrderPreviewBody = { stock_id: stock.id, side };
    if (side === "sell" && sellAll) {
      body.sell_all = true;
    } else if (kobo !== null) {
      body.amount_kobo = kobo;
    }
    if (side === "buy") {
      body.pay_with = payWith;
    }
    return body;
  }

  async function fetchPreview() {
    if (!amountOk) return;
    setPending(true);
    setPreviewError(null);
    try {
      const next = await appApi.orders.preview(previewBody());
      setPreview(next);
      setStale(false);
      setPinError(null);
      renew();
      setStep("review");
    } catch (caught) {
      setPreviewError(asApiError(caught).message);
    }
    setPending(false);
  }

  async function onPin(pin: string) {
    if (preview === null) return;
    setPending(true);
    setPinError(null);
    try {
      const order = await appApi.orders.place({ preview_id: preview.preview_id, pin }, key);
      onOpenChange(false);
      router.push(`/orders/${order.id}`);
    } catch (caught) {
      setPinError(asApiError(caught));
      setPending(false);
    }
  }

  // PinStep calls this for Back, and for PRICE_CHANGED: the review then asks
  // for a new price instead of resending the stale preview.
  function backToReview() {
    if (pinError?.code === "PRICE_CHANGED") setStale(true);
    setPinError(null);
    setStep("review");
  }

  const reviewRows: { label: string; value: React.ReactNode; emphasis?: boolean }[] = [];
  if (preview !== null) {
    reviewRows.push({ label: "Amount", value: formatNaira(preview.amount_kobo) });
    reviewRows.push({ label: "Shares", value: `About ${formatShares(preview.shares_micro)}` });
    reviewRows.push({ label: "Price", value: formatNaira(preview.price_kobo) });
    for (const fee of preview.fees) {
      reviewRows.push({
        label: fee.label,
        value: fee.kobo === null ? (fee.note ?? "—") : formatNaira(fee.kobo),
      });
    }
    if (preview.you_receive_kobo !== null) {
      reviewRows.push({
        label: "You receive",
        value: formatNaira(preview.you_receive_kobo),
        emphasis: true,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tradeTitle(side, stock.name)}</DialogTitle>
          <DialogDescription>
            {step === "amount" &&
              (side === "buy"
                ? "Choose how much naira to invest."
                : "Choose how much naira of shares to sell.")}
            {step === "review" && "Check the price and fees before you confirm."}
            {step === "pin" && "Confirm with your PIN."}
          </DialogDescription>
        </DialogHeader>
        {step === "amount" && (
          <div className="flex flex-col gap-4">
            <AmountField
              id="trade-amount"
              label="Amount"
              kobo={kobo}
              onKoboChange={setKobo}
              minKobo={minKobo}
              disabled={sellAll}
            />
            {side === "sell" && (
              <Label htmlFor="sell-all" className="flex min-h-11 items-center gap-3 font-normal">
                <Checkbox
                  id="sell-all"
                  checked={sellAll}
                  onCheckedChange={(checked) => setSellAll(checked === true)}
                />
                Sell all
              </Label>
            )}
            {side === "buy" && (
              <>
                <p className="text-muted-foreground text-sm tabular-nums">
                  Cash available {cash === undefined ? "—" : moneyText(cash.available_kobo)}
                </p>
                <div className="flex flex-col gap-2">
                  <p id="pay-with-label" className="text-foreground text-sm font-medium">
                    Pay with
                  </p>
                  <RadioGroup
                    aria-labelledby="pay-with-label"
                    name="pay-with"
                    value={payWith}
                    onValueChange={(value) =>
                      setChosenPayWith(value === "bank_transfer" ? "bank_transfer" : "cash")
                    }
                    className="gap-2"
                  >
                    <Label
                      htmlFor="pay-cash"
                      className="has-[[data-state=checked]]:border-signal flex min-h-11 items-center gap-3 rounded-lg border border-stroke bg-surface px-4 font-normal transition-colors"
                    >
                      <RadioGroupItem id="pay-cash" value="cash" /> Cash
                    </Label>
                    <Label
                      htmlFor="pay-bank"
                      className="has-[[data-state=checked]]:border-signal flex min-h-11 items-center gap-3 rounded-lg border border-stroke bg-surface px-4 font-normal transition-colors"
                    >
                      <RadioGroupItem id="pay-bank" value="bank_transfer" /> Bank transfer
                    </Label>
                  </RadioGroup>
                </div>
              </>
            )}
            <Button disabled={!amountOk || pending} onClick={() => void fetchPreview()}>
              {pending ? "Getting a price…" : "Continue"}
            </Button>
            <p role="status" aria-live="polite" className="text-loss text-sm empty:hidden">
              {previewError}
            </p>
          </div>
        )}
        {step === "review" && preview !== null && (
          <div className="flex flex-col gap-4">
            {expired ? (
              <>
                <p role="status" className="text-muted-foreground text-sm">
                  This price expired.
                </p>
                <Button disabled={pending} onClick={() => void fetchPreview()}>
                  {pending ? "Getting a price…" : "Get a new price"}
                </Button>
                <p role="status" aria-live="polite" className="text-loss text-sm empty:hidden">
                  {previewError}
                </p>
              </>
            ) : (
              <>
                <ReviewList rows={reviewRows} />
                <p className="text-ink text-[15px]">{executesSentence(preview)}</p>
                {preview.notes.map((note) => (
                  <p key={note} className="text-muted-foreground text-sm">
                    {note}
                  </p>
                ))}
                {countdownState !== null && (
                  <p className="text-muted-foreground text-sm tabular-nums" suppressHydrationWarning>
                    Price held for {countdownState.text}
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
