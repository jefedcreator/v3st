"use client";

import * as React from "react";

import type { AppAutomationDto } from "@/types/app";
import { useAutomationsQuery, useSettingsActions } from "@/hooks/app/use-settings";
import { PinStep } from "@/components/app/money/pin-step";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/primitives";
import { automationLine } from "./settings";

// Automatic actions: turn off in place, renew with the PIN.
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
  const [renewId, setRenewId] = React.useState<string | null>(null);
  const [pinError, setPinError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setConfirmOff(null);
      setRenewId(null);
      setPinError(null);
    }
  }, [open]);

  const automations = data ?? initial;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Automatic actions</DialogTitle>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-4">
          {automations.map((automation) => {
            if (renewId === automation.id) {
              return (
                <PinStep
                  key={automation.id}
                  heading={`Renew ${automation.title}`}
                  pending={false}
                  error={null}
                  onSubmit={async (pin) => {
                    try {
                      await renewAutomation(automation.id, pin);
                      setRenewId(null);
                    } catch {
                      setPinError("That didn't renew. Please try again.");
                    }
                  }}
                  onBack={() => setRenewId(null)}
                />
              );
            }
            return (
              <div key={automation.id} className="flex flex-col gap-1 border-b border-stroke pb-3">
                <span className="text-ink text-[15px]">{automation.title}</span>
                <span className="text-muted-foreground text-sm">{automation.detail}</span>
                <span className="text-subtle text-sm">{automationLine(automation)}</span>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {automation.active && confirmOff !== automation.id && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmOff(automation.id)}
                      >
                        Turn off
                      </Button>
                      {automation.needs_renewal && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRenewId(automation.id)}
                        >
                          Renew
                        </Button>
                      )}
                    </>
                  )}
                  {confirmOff === automation.id && (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground text-sm">
                        Turn off {automation.title}?
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            await turnOffAutomation(automation.id);
                            setConfirmOff(null);
                          } catch {
                            setPinError("That didn't turn off. Please try again.");
                          }
                        }}
                      >
                        Turn off
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmOff(null)}>
                        Keep it on
                      </Button>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {pinError !== null && (
            <p role="status" aria-live="polite" className="text-loss text-sm">
              {pinError}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
