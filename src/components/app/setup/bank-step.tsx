"use client";

import * as React from "react";

import { appApi, AppApiError } from "@/utils/app-api";
import type { AppBankDto } from "@/types/app";
import { Button } from "@/primitives";
import { BankFields } from "@/components/app/bank/bank-fields";
import { PinInput } from "@/components/app/pin/pin-input";
import { isValidAccountNumber } from "@/components/app/bank/bank";
import { isValidPin } from "@/components/app/pin/pin";

export function BankStep({
  banks,
  onDone,
}: {
  banks: AppBankDto[];
  onDone: () => void;
}) {
  const [bankCode, setBankCode] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const ready = bankCode !== "" && isValidAccountNumber(accountNumber) && isValidPin(pin);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setPending(true);
    setError(null);
    try {
      await appApi.bankAccount.put({ bank_code: bankCode, account_number: accountNumber, pin });
      onDone();
    } catch (caught) {
      if (caught instanceof AppApiError) setError(caught.message);
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
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
      <Button type="submit" disabled={!ready || pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
      {error !== null && (
        <p role="status" aria-live="polite" className="text-loss text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
