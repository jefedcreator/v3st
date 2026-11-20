"use client";

import type { AppBankDto } from "@/types/app";
import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/primitives";

import { isValidAccountNumber } from "./bank";

// The bank select and the 10-digit account number, one control per line.
export function BankFields({
  banks,
  bankCode,
  accountNumber,
  onChange,
}: {
  banks: AppBankDto[];
  bankCode: string;
  accountNumber: string;
  onChange: (next: { bankCode: string; accountNumber: string }) => void;
}) {
  const numberId = "bank-account-number";
  const numberErrorId = `${numberId}-error`;
  const touched = accountNumber.length > 0;
  const numberInvalid = touched && !isValidAccountNumber(accountNumber);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="bank-select">Bank</Label>
        <Select value={bankCode} onValueChange={(code) => onChange({ bankCode: code, accountNumber })}>
          <SelectTrigger id="bank-select">
            <SelectValue placeholder="Choose your bank" />
          </SelectTrigger>
          <SelectContent>
            {banks.map((bank) => (
              <SelectItem key={bank.code} value={bank.code}>
                {bank.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={numberId}>Account number</Label>
        <Input
          id={numberId}
          inputMode="numeric"
          autoComplete="off"
          value={accountNumber}
          aria-invalid={numberInvalid}
          aria-describedby={numberInvalid ? numberErrorId : undefined}
          onChange={(event) => onChange({ bankCode, accountNumber: event.target.value })}
        />
        {numberInvalid && (
          <p id={numberErrorId} className="text-loss text-sm">
            Your account number is 10 digits.
          </p>
        )}
      </div>
    </div>
  );
}
