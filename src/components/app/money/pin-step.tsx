"use client";

import * as React from "react";

import { settingsHref } from "@/utils/app-paths";
import type { AppApiError } from "@/utils/app-api";
import { pinErrorAction } from "./money-job";
import { isValidPin } from "@/components/app/pin/pin";
import { PinInput } from "@/components/app/pin/pin-input";
import { Button } from "@/primitives";

type PinAction = ReturnType<typeof pinErrorAction>;

// The last step of a money modal: the PIN, and the error branching. Each
// error object is handled once, when it arrives; a parent re-render (a
// countdown ticking every second) never clears the PIN again.
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
  const [shown, setShown] = React.useState<{ message: string; action: PinAction } | null>(null);
  const onBackRef = React.useRef(onBack);
  onBackRef.current = onBack;
  const handled = React.useRef<AppApiError | null>(null);

  React.useEffect(() => {
    if (error === null) {
      handled.current = null;
      setShown(null);
      return;
    }
    if (handled.current === error) return;
    handled.current = error;
    const action = pinErrorAction(error.code);
    if (action === "new_price") {
      onBackRef.current();
      return;
    }
    if (action === "clear_pin") setPin("");
    setShown({ message: error.message, action });
  }, [error]);

  const errorId = "pin-step-error";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (isValidPin(pin) && !pending) onSubmit(pin);
      }}
    >
      <h3 className="sr-only">{heading}</h3>
      <PinInput
        id="confirm-pin"
        label="Your PIN"
        value={pin}
        onChange={setPin}
        invalid={shown !== null}
        describedBy={shown !== null ? errorId : undefined}
        autoFocus
      />
      <Button type="submit" disabled={!isValidPin(pin) || pending}>
        {pending ? "Confirming…" : "Confirm"}
      </Button>
      <p id={errorId} role="status" aria-live="polite" className="text-loss text-sm empty:hidden">
        {shown === null ? null : shown.message}
        {shown !== null && shown.action === "locked" && (
          <>
            {" "}
            <a className="text-gain underline underline-offset-4" href={settingsHref("reset-pin")}>
              Reset your PIN
            </a>
          </>
        )}
      </p>
      <Button type="button" variant="ghost" onClick={onBack}>
        {backLabel}
      </Button>
    </form>
  );
}
