"use client";

import * as React from "react";

import { useSettingsActions, useBanksQuery } from "@/hooks/app/use-settings";
import { AppApiError } from "@/utils/app-api";
import type { AppBankDto } from "@/types/app";
import { BankFields } from "@/components/app/bank/bank-fields";
import { PinInput } from "@/components/app/pin/pin-input";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/primitives";

export function BankDialog({
  open,
  onOpenChange,
  banks,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  banks: AppBankDto[];
}) {
  const { putBankAccount } = useSettingsActions();
  useBanksQuery(banks);
  const [bankCode, setBankCode] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setBankCode("");
      setAccountNumber("");
      setPin("");
      setError(null);
    }
  }, [open]);

  async function onSave() {
    setPending(true);
    setError(null);
    try {
      await putBankAccount({ bank_code: bankCode, account_number: accountNumber, pin });
      onOpenChange(false);
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
          <DialogTitle>Bank account</DialogTitle>
          <DialogDescription>
            Transfers in come from this account and withdrawals go to it. The name must match your
            verified name.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-4">
          <BankFields
            banks={banks}
            bankCode={bankCode}
            accountNumber={accountNumber}
            onChange={(next) => {
              setBankCode(next.bankCode);
              setAccountNumber(next.accountNumber);
            }}
          />
          <PinInput id="bank-pin" label="Your PIN" value={pin} onChange={setPin} />
          <Button
            disabled={bankCode === "" || accountNumber.length !== 10 || pin.length !== 4 || pending}
            onClick={() => void onSave()}
          >
            {pending ? "Saving…" : "Save"}
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
