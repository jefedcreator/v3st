"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { appApi, AppApiError, type OrderPreviewBody } from "@/utils/app-api";
import type { AppOrderPreviewDto, AppStockDetailDto } from "@/types/app";
import { formatNaira, formatShares } from "@/utils/format";
import { useIdempotencyKey } from "@/hooks/app/use-idempotency-key";
import { useCashQuery } from "@/hooks/app/use-cash";
import { AmountField } from "@/components/app/money/amount-field";
import { PinStep } from "@/components/app/money/pin-step";
import { ReviewList } from "@/components/app/money/review-list";
import { useCountdown } from "@/components/app/money/use-countdown";
import { BetaLine } from "@/components/app/beta-line";
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
import { defaultPayWith, executesSentence, previewExpired, tradeTitle } from "./trade";

// The trade job: amount (or Sell all), review, PIN. One Dialog, never a
// second modal on top.
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
  const [step, setStep] = React.useState<"amount" | "review" | "pin">("amount");
  const [kobo, setKobo] = React.useState<string | null>(null);
  const [sellAll, setSellAll] = React.useState(false);
  const [payWith, setPayWith] = React.useState<"cash" | "bank_transfer">("cash");
  const [preview, setPreview] = React.useState<AppOrderPreviewDto | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [pinError, setPinError] = React.useState<AppApiError | null>(null);
  const [statusError, setStatusError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const { key, renew } = useIdempotencyKey();
  const { data: cash } = useCashQuery();
  const [expired, setExpired] = React.useState(false);
  const [nowTick, setNowTick] = React.useState(() => new Date());

  React.useEffect(() => {
    const timer = setInterval(() => setNowTick(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (open) {
      setStep("amount");
      setKobo(null);
      setSellAll(false);
      setPreview(null);
      setPreviewError(null);
      setPinError(null);
      setStatusError(null);
      setExpired(false);
      renew();
    }
  }, [open, renew]);

  const countdownState = useCountdown(preview !== null ? preview.expires_at : null);

  // Pay with defaults to cash when the cash query is loaded and covers the
  // amount; the customer can always switch.
  const availableKobo = cash?.available_kobo ?? null;
  const paidWithCash = side === "buy" && cash !== undefined;
  React.useEffect(() => {
    if (paidWithCash) {
      setPayWith(defaultPayWith(availableKobo, kobo));
    }
  }, [paidWithCash, availableKobo, kobo]);

  function buildPreviewBody(): OrderPreviewBody {
    const body: OrderPreviewBody = { stock_id: stock.id, side };
    if (side === "buy") {
      body.amount_kobo = kobo ?? undefined;
      body.pay_with = payWith;
    } else if (sellAll) {
      body.sell_all = true;
    } else {
      body.amount_kobo = kobo ?? undefined;
    }
    return body;
  }

  async function runPreview() {
    setPending(true);
    setPreviewError(null);
    try {
      const next = await appApi.orders.preview(buildPreviewBody());
      setPreview(next);
      setExpired(false);
      renew();
      setStep("review");
    } catch (caught) {
      if (caught instanceof AppApiError) setPreviewError(caught.message);
      else setPreviewError("Something went wrong. Please try again.");
    }
    setPending(false);
  }

  function onBackFromPin() {
    if (preview !== null && previewExpired(preview.expires_at, new Date())) {
      setExpired(true);
    }
    setStep("review");
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
      if (caught instanceof AppApiError) setPinError(caught);
      else setPinError(new AppApiError("Something went wrong. Please try again.", 0, "NETWORK"));
      setPending(false);
    }
  }

  React.useEffect(() => {
    if (preview === null) return;
    if (previewExpired(preview.expires_at, nowTick)) setExpired(true);
  }, [preview, nowTick]);

  const reviewRows =
    preview === null
      ? []
      : [
          { label: "Amount", value: formatNaira(preview.amount_kobo) },
          { label: "About", value: formatShares(preview.shares_micro) },
          { label: "Price", value: formatNaira(preview.price_kobo) },
          ...preview.fees.map((fee) => ({
            label: fee.label,
            value: fee.kobo === null ? (fee.note ?? "—") : formatNaira(fee.kobo),
          })),
          ...(preview.you_receive_kobo !== null
            ? [{ label: "You receive", value: formatNaira(preview.you_receive_kobo), emphasis: true }]
            : []),
        ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tradeTitle(side, stock.name)}</DialogTitle>
          {step === "amount" && (
            <DialogDescription>
              {side === "buy"
                ? "Choose how much naira to invest."
                : "Choose how much naira of shares to sell."}
            </DialogDescription>
          )}
        </DialogHeader>
        {step === "amount" && (
          <div className="mt-2 flex flex-col gap-4">
            <AmountField
              id="trade-amount"
              label="Amount"
              kobo={kobo}
              onKoboChange={setKobo}
              minKobo={minKobo}
              disabled={sellAll}
            />
            {side === "sell" && (
              <Label
                htmlFor="sell-all"
                className="flex min-h-11 items-center gap-3 font-normal"
              >
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
                <p className="text-muted-foreground text-sm">
                  Cash available {cash === undefined ? "—" : formatNaira(cash.available_kobo ?? "0")}
                </p>
                <div className="flex flex-col gap-2">
                  <Label>Pay with</Label>
                  <RadioGroup
                    name="pay-with"
                    value={payWith}
                    onValueChange={(value) => setPayWith(value === "bank_transfer" ? "bank_transfer" : "cash")}
                    className="gap-2"
                  >
                    <Label
                      htmlFor="pay-cash"
                      className="flex min-h-11 items-center gap-3 rounded-lg border border-stroke bg-surface px-4 font-normal"
                    >
                      <RadioGroupItem id="pay-cash" value="cash" /> Cash
                    </Label>
                    <Label
                      htmlFor="pay-bank"
                      className="flex min-h-11 items-center gap-3 rounded-lg border border-stroke bg-surface px-4 font-normal"
                    >
                      <RadioGroupItem id="pay-bank" value="bank_transfer" /> Bank transfer
                    </Label>
                  </RadioGroup>
                </div>
              </>
            )}
            <Button
              disabled={pending || (sellAll ? false : kobo === null)}
              onClick={() => void runPreview()}
            >
              {pending ? "Getting a price…" : "Continue"}
            </Button>
            {previewError !== null && (
              <p role="status" aria-live="polite" className="text-loss text-sm">
                {previewError}
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
                <Button variant="outline" onClick={() => void runPreview()}>
                  Get a new price
                </Button>
              </>
            ) : (
              <>
                <ReviewList rows={reviewRows} />
                <p className="text-muted-foreground text-[15px]">{executesSentence(preview)}</p>
                {preview.notes.map((note) => (
                  <p key={note} className="text-muted-foreground text-sm">
                    {note}
                  </p>
                ))}
                {countdownState !== null && (
                  <p className="text-muted-foreground text-sm" suppressHydrationWarning>
                    Price held for {countdownState.text}
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
              onBack={onBackFromPin}
            />
          </div>
        )}
        {statusError !== null && (
          <p className="text-loss text-sm" role="status">
            {statusError}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
