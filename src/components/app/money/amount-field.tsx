"use client";

import * as React from "react";

import { formatNaira, parseNairaInput } from "@/utils/format";
import { amountCheck, amountMessage, type AmountCheck } from "./amount";
import { Input, Label } from "@/primitives";

// The digits a kobo amount is typed as, without the fixed ₦ prefix.
function typedNaira(kobo: string): string {
  return formatNaira(kobo).replace("₦", "");
}

// A naira amount field: a fixed ₦ prefix at amount size, exact kobo parsing,
// and the policy/availability messages once it has been touched. A value set
// from outside (All available) shows in the field.
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
  const [text, setText] = React.useState(() => (kobo === null ? "" : typedNaira(kobo)));
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (parseNairaInput(text) === kobo) return;
    setText(kobo === null ? "" : typedNaira(kobo));
    if (kobo !== null) setTouched(true);
    // Only an outside change of `kobo` resyncs the text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kobo]);

  const check: AmountCheck = amountCheck(kobo, { minKobo, maxKobo, availableKobo });
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const message = touched && !disabled ? amountMessage(check, { minKobo, maxKobo }) : null;
  const describedBy: string[] = [];
  if (minKobo !== undefined) describedBy.push(hintId);
  if (message !== null) describedBy.push(errorId);

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
          className="type-app-amount text-muted-foreground pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
        >
          ₦
        </span>
        <Input
          id={id}
          className="type-app-amount h-16 pl-11 tabular-nums"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={text}
          disabled={disabled}
          aria-describedby={describedBy.length > 0 ? describedBy.join(" ") : undefined}
          aria-invalid={message !== null && check !== "empty"}
          onBlur={() => setTouched(true)}
          onChange={onChange}
        />
      </div>
      {minKobo !== undefined && (
        <p id={hintId} className="text-subtle text-sm">
          Minimum {formatNaira(minKobo)}
        </p>
      )}
      <p id={errorId} aria-live="polite" className="text-loss text-sm empty:hidden">
        {message}
      </p>
    </div>
  );
}
