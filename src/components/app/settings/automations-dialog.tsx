"use client";

import * as React from "react";

import type { AppAutomationDto } from "@/types/app";
import { AppApiError, useAutomationsQuery, useSettingsActions } from "@/hooks/app/use-settings";
import { PinStep } from "@/components/app/money/pin-step";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/primitives";
import { automationLine } from "./settings";

function asApiError(caught: unknown): AppApiError {
  if (caught instanceof AppApiError) return caught;
  return new AppApiError("Something went wrong. Please try again.", 0, "SOMETHING_WENT_WRONG");
}

// Automatic actions: turn one off in place, or renew one with the PIN, which
// swaps the dialog's body to the PIN step. The dialog stays open.
export function AutomationsDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: AppAutomationDto[];
}) {
  const { data } = useAutomationsQuery(initial);
  const { turnOffAutomation, renewAutomation } = useSettingsActions();
  const [confirmOff, setConfirmOff] = React.useState<string | null>(null);
  const [renewing, setRenewing] = React.useState<AppAutomationDto | null>(null);
  const [pinError, setPinError] = React.useState<AppApiError | null>(null);
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<{ text: string; failed: boolean } | null>(null);

  React.useEffect(() => {
    if (open) {
      setConfirmOff(null);
      setRenewing(null);
      setPinError(null);
      setPending(false);
      setMessage(null);
    }
  }, [open]);

  const automations = data ?? initial;

  async function onRenew(pin: string) {
    if (renewing === null) return;
    setPending(true);
    setPinError(null);
    try {
      await renewAutomation(renewing.id, pin);
      setMessage({ text: `${renewing.title} is renewed.`, failed: false });
      setRenewing(null);
    } catch (caught) {
      setPinError(asApiError(caught));
    }
    setPending(false);
  }

  async function onTurnOff(automation: AppAutomationDto) {
    setPending(true);
    setMessage(null);
    try {
      await turnOffAutomation(automation.id);
      setMessage({ text: `${automation.title} is turned off.`, failed: false });
      setConfirmOff(null);
    } catch (caught) {
      setMessage({ text: asApiError(caught).message, failed: true });
    }
    setPending(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Automatic actions</DialogTitle>
          <DialogDescription>
            Actions V3ST takes for you, within the limits you agreed to.
          </DialogDescription>
        </DialogHeader>
        {renewing !== null ? (
          <PinStep
            heading={`Renew ${renewing.title}`}
            pending={pending}
            error={pinError}
            onSubmit={(pin) => void onRenew(pin)}
            onBack={() => {
              setPinError(null);
              setRenewing(null);
            }}
          />
        ) : (
          <div className="flex flex-col">
            {automations.length === 0 && (
              <p className="text-muted-foreground py-4 text-sm">No automatic actions yet.</p>
            )}
            <ul className="flex flex-col">
              {automations.map((automation) => (
                <li key={automation.id} className="flex flex-col gap-1 border-b border-stroke py-3 last:border-b-0">
                  <span className="text-heading text-[15px] font-medium">{automation.title}</span>
                  <span className="text-muted-foreground text-sm">{automation.detail}</span>
                  <span className={automation.needs_renewal ? "text-gain text-sm" : "text-subtle text-sm"}>
                    {automationLine(automation)}
                  </span>
                  {automation.active && confirmOff !== automation.id && (
                    <span className="flex flex-wrap items-center gap-2 pt-1">
                      <Button
                        variant={automation.needs_renewal ? "default" : "outline"}
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          setMessage(null);
                          setRenewing(automation);
                        }}
                      >
                        Renew
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => setConfirmOff(automation.id)}
                      >
                        Turn off
                      </Button>
                    </span>
                  )}
                  {confirmOff === automation.id && (
                    <span className="flex flex-col gap-2 pt-1">
                      <span className="text-ink text-sm">Turn off {automation.title}?</span>
                      <span className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => void onTurnOff(automation)}
                        >
                          {pending ? "Turning off…" : "Turn off"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmOff(null)}>
                          Keep it on
                        </Button>
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p
          role="status"
          aria-live="polite"
          className={message?.failed === true ? "text-loss text-sm empty:hidden" : "text-gain text-sm empty:hidden"}
        >
          {message === null ? null : message.text}
        </p>
      </DialogContent>
    </Dialog>
  );
}
