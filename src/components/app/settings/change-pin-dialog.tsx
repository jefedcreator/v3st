"use client";

import * as React from "react";

import { useSettingsActions } from "@/hooks/app/use-settings";
import { AppApiError } from "@/utils/app-api";
import { settingsHref } from "@/utils/app-paths";
import { pinErrorAction } from "@/components/app/money/money-job";
import { PinInput } from "@/components/app/pin/pin-input";
import { isValidPin, pinsMatch } from "@/components/app/pin/pin";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/primitives";

// Change PIN: current, new, confirm, done.
export function ChangePinDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { setPin } = useSettingsActions();
  const [current, setCurrent] = React.useState("");
  const [nextPin, setNextPin] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<{ message: string; locked: boolean } | null>(null);
  const [done, setDone] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setCurrent("");
      setNextPin("");
      setConfirm("");
      setError(null);
      setDone(false);
    }
  }, [open]);

  async function onSave() {
    setPending(true);
    setError(null);
    try {
      await setPin({ pin: nextPin, current_pin: current });
      setDone(true);
    } catch (caught) {
      if (caught instanceof AppApiError) {
        const action = pinErrorAction(caught.code);
        if (action === "clear_pin") setCurrent("");
        setError({ message: caught.message, locked: action === "locked" });
      } else {
        setError({ message: "Something went wrong. Please try again.", locked: false });
      }
    }
    setPending(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change PIN</DialogTitle>
        </DialogHeader>
        {done ? (
          <p role="status" aria-live="polite" className="text-gain mt-3 text-sm">
            Your PIN is changed.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <PinInput id="current-pin" label="Current PIN" value={current} onChange={setCurrent} />
            <PinInput id="new-pin" label="New PIN" value={nextPin} onChange={setNextPin} />
            <PinInput
              id="new-pin-confirm"
              label="Enter the new PIN again"
              value={confirm}
              onChange={setConfirm}
            />
            {isValidPin(nextPin) && isValidPin(confirm) && !pinsMatch(nextPin, confirm) && (
              <p className="text-loss text-sm">Those PINs don&apos;t match.</p>
            )}
            <Button
              disabled={
                !isValidPin(current) || !pinsMatch(nextPin, confirm) || nextPin === current || pending
              }
              onClick={() => void onSave()}
            >
              {pending ? "Saving…" : "Change PIN"}
            </Button>
            <p role="status" aria-live="polite" className="text-loss text-sm empty:hidden">
              {error === null ? null : error.message}
              {error !== null && error.locked && (
                <>
                  {" "}
                  <a className="text-gain underline underline-offset-4" href={settingsHref("reset-pin")}>
                    Reset your PIN
                  </a>
                </>
              )}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
