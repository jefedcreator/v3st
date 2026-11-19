"use client";

import { InputOTP, InputOTPGroup, InputOTPSlot, Label } from "@/primitives";

import { isValidPin } from "./pin";

// A labelled 4-digit PIN entry on one line.
export function PinInput({
  id,
  label,
  value,
  onChange,
  autoFocus = false,
  invalid = false,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <InputOTP
        id={id}
        maxLength={4}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={onChange}
        aria-invalid={invalid || value.length === 4 ? !isValidPin(value) : undefined}
        aria-describedby={describedBy}
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}
