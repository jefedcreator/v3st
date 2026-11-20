"use client";

import * as React from "react";

import { appApi, AppApiError } from "@/utils/app-api";
import type { AppEarningsDto } from "@/types/app";
import { useEarningsActions } from "@/hooks/app/use-earnings";
import { PinStep } from "@/components/app/money/pin-step";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/primitives";

// What happens to your earnings: payout or reinvest, then the PIN.
export function EarningsChoiceDialog({
  open,
  onOpenChange,
  earnings,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  earnings: AppEarningsDto;
}) {
  const { setPreference } = useEarningsActions();
  const [step, setStep] = React.useState<"choice" | "pin">("choice");
  const [choice, setChoice] = React.useState<"payout" | "reinvest">(
    earnings.choice === "reinvest" ? "reinvest" : "payout",
  );
  const [stockId, setStockId] = React.useState<string | null>(
    earnings.reinvest_stock?.id ?? null,
  );
  const [stocks, setStocks] = React.useState<{ id: string; name: string; trading: string }[]>([]);
  const [pinError, setPinError] = React.useState<AppApiError | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setStep("choice");
      setPinError(null);
      setPending(false);
      return;
    }
    void (async () => {
      try {
        const list = await appApi.stocks.list({});
        setStocks(list.filter((stock) => stock.trading !== "paused"));
      } catch {
        setStocks([]);
      }
    })();
  }, [open]);

  async function onPin(pin: string) {
    setPending(true);
    setPinError(null);
    const body: { choice: "payout" | "reinvest" | "unset"; stock_id?: string; pin: string } = {
      choice,
      pin,
    };
    if (choice === "reinvest" && stockId !== null) {
      body.stock_id = stockId;
    }
    try {
      await setPreference(body);
      onOpenChange(false);
    } catch (caught) {
      setPinError(
        caught instanceof AppApiError
          ? caught
          : new AppApiError("Something went wrong. Please try again.", 0, "SOMETHING_WENT_WRONG"),
      );
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>What happens to your earnings</DialogTitle>
          <DialogDescription>
            {step === "choice" ? "Choose where your Friday earnings go." : "Confirm with your PIN."}
          </DialogDescription>
        </DialogHeader>
        {step === "choice" && (
          <div className="mt-2 flex flex-col gap-4">
            <RadioGroup
              aria-label="What happens to your earnings"
              name="earnings-choice"
              value={choice}
              onValueChange={(value) => setChoice(value === "reinvest" ? "reinvest" : "payout")}
            >
              <Label
                htmlFor="choice-payout"
                className="flex min-h-11 items-center gap-3 rounded-lg border border-stroke bg-surface px-4 font-normal"
              >
                <RadioGroupItem id="choice-payout" value="payout" /> Pay me on Fridays
              </Label>
              <Label
                htmlFor="choice-reinvest"
                className="flex min-h-11 items-center gap-3 rounded-lg border border-stroke bg-surface px-4 font-normal"
              >
                <RadioGroupItem id="choice-reinvest" value="reinvest" /> Reinvest in a stock
              </Label>
            </RadioGroup>
            {choice === "reinvest" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="reinvest-stock">Stock</Label>
                <Select
                  value={stockId ?? undefined}
                  onValueChange={(id) => setStockId(id)}
                >
                  <SelectTrigger id="reinvest-stock">
                    <SelectValue placeholder="Choose a stock" />
                  </SelectTrigger>
                  <SelectContent>
                    {stocks.map((stock) => (
                      <SelectItem key={stock.id} value={stock.id}>
                        {stock.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {earnings.limits.map((line) => (
              <p key={line} className="text-subtle text-sm">
                {line}
              </p>
            ))}
            <Button
              disabled={choice === "reinvest" && stockId === null}
              onClick={() => setStep("pin")}
            >
              Continue
            </Button>
          </div>
        )}
        {step === "pin" && (
          <PinStep
            heading="Confirm with your PIN"
            pending={pending}
            error={pinError}
            onSubmit={(pin) => void onPin(pin)}
            onBack={() => {
              setPinError(null);
              setStep("choice");
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
