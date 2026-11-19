"use client";

import * as React from "react";

import { formatNaira, parseNairaInput } from "@/utils/format";
import { amountCheck, amountMessage, type AmountCheck } from "./amount";
import { Input, Label } from "@/primitives";

// A naira amount field: fixed ₦ prefix, exact kobo parsing, and the
// policy/availability messages once it has been touched.
export function AmountField({
  id,
  label,
  kobo,
  onKoboChange,
  minKobo,
  maxKobo,
  availableKobo,
  disabled = false,
}: {
  id: string;
  label: string;
  kobo: string | null;
  onKoboChange: (k: string | null) => void;
  minKobo?: string;
  maxKobo?: string;
  availableKobo?: string | null;
  disabled?: boolean;
}) {
  const [text, setText] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [focused, setFocused] = React.useState(false);

  const check: AmountCheck = amountCheck(kobo, { minKobo, maxKobo, availableKobo });
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const message = touched ? amountMessage(check, { minKobo, maxKobo }) : null;
  const describedBy = [hintId, message !== null ? errorId : null].filter(Boolean).join(" ");

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setText(next);
    onKoboChange(parseNairaInput(next));
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-base"
        >
          ₦
        </span>
        <Input
          id={id}
          className="pl-9 text-base tabular-nums"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={text}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={message !== null && check !== "empty"}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setTouched(true);
          }}
          onChange={onChange}
        />
      </div>
      {minKobo !== undefined && (
        <p id={hintId} className="text-subtle text-sm">
          Minimum {formatNaira(minKobo)}
        </p>
      )}
      {message !== null && (
        <p id={errorId} role={focused ? "status" : undefined} aria-live="polite" className="text-loss text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
