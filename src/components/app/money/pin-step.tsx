"use client";

import * as React from "react";

import { settingsHref } from "@/utils/app-paths";
import { pinErrorAction } from "./money-job";
import { isValidPin } from "@/components/app/pin/pin";
import { PinInput } from "@/components/app/pin/pin-input";
import { Button } from "@/primitives";
import type { AppApiError } from "@/utils/app-api";

// The last step of a money modal: the PIN, and the error branching.
export function PinStep({
  heading,
  pending,
  error,
  onSubmit,
  onBack,
  backLabel = "Back",
}: {
  heading: string;
  pending: boolean;
  error: AppApiError | null;
  onSubmit: (pin: string) => void;
  onBack: () => void;
  backLabel?: string;
}) {
  const [pin, setPin] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [action, setAction] = React.useState<"clear_pin" | "locked" | "new_price" | "show">("show");

  React.useEffect(() => {
    if (error === null) return;
    const next = pinErrorAction(error.code);
    setMessage(error.message);
    setAction(next);
    if (next === "clear_pin") setPin("");
    if (next === "new_price") onBack();
  }, [error, onBack]);

  const errorId = "pin-step-error";

  return (
    <div className="flex flex-col gap-4">
      <h3 className="type-app-heading text-heading">{heading}</h3>
      <PinInput
        id="confirm-pin"
        label="Your PIN"
        value={pin}
        onChange={setPin}
        invalid={error !== null}
        describedBy={message !== null ? errorId : undefined}
        autoFocus
      />
      <Button
        onClick={() => onSubmit(pin)}
        disabled={!isValidPin(pin) || pending}
      >
        {pending ? "Confirming…" : "Confirm"}
      </Button>
      {message !== null && (
        <p id={errorId} role="status" aria-live="polite" className="text-loss text-sm">
          {message}
          {action === "locked" && (
            <>
              {" "}
              <a className="text-gain underline" href={settingsHref("reset-pin")}>
                Reset your PIN
              </a>
            </>
          )}
        </p>
      )}
      <Button variant="ghost" size="sm" onClick={onBack}>
        {backLabel}
      </Button>
    </div>
  );
}
