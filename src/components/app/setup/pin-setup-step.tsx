"use client";

import * as React from "react";

import { appApi, AppApiError } from "@/utils/app-api";
import { Button } from "@/primitives";
import { PinInput } from "@/components/app/pin/pin-input";
import { isValidPin, pinsMatch } from "@/components/app/pin/pin";

export function PinSetupStep({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const mismatch = pin.length === 4 && confirm.length === 4 && !pinsMatch(pin, confirm);
  const ready = pinsMatch(pin, confirm);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setPending(true);
    setError(null);
    try {
      await appApi.security.setPin({ pin });
      onDone();
    } catch (caught) {
      if (caught instanceof AppApiError) setError(caught.message);
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <PinInput
        id="setup-pin"
        label="Choose a 4-digit PIN"
        value={pin}
        onChange={(v) => {
          setPin(v);
          setError(null);
        }}
        autoFocus
      />
      <PinInput
        id="setup-pin-confirm"
        label="Enter it again"
        value={confirm}
        onChange={setConfirm}
        describedBy={mismatch ? "pin-mismatch" : undefined}
      />
      {mismatch && (
        <p id="pin-mismatch" className="text-loss text-sm">
          Those PINs don't match.
        </p>
      )}
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
