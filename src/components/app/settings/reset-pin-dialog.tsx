"use client";

import dynamic from "next/dynamic";
import * as React from "react";

import { appApi, AppApiError } from "@/utils/app-api";
import type { PrivyMode } from "@/types/app-ui";
import { PinInput } from "@/components/app/pin/pin-input";
import { AppSkeleton } from "@/components/app/app-skeleton";
import { isValidPin, pinsMatch } from "@/components/app/pin/pin";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/primitives";

const PrivyReset = dynamic(() => import("./privy-reset"), {
  ssr: false,
  loading: () => <AppSkeleton variant="form" />,
});

// Reset your PIN: a fresh email sign-in, then the new PIN twice.
export function ResetPinDialog({
  open,
  onOpenChange,
  email,
  mode,
  appId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  email: string | null;
  mode: PrivyMode;
  appId: string | null;
}) {
  const [tokens, setTokens] = React.useState<{ access_token: string; identity_token: string } | null>(null);
  const [pin, setPin] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setTokens(null);
      setPin("");
      setConfirm("");
      setError(null);
      setDone(false);
    }
  }, [open]);

  async function simulatedTokens() {
    if (email === null) return;
    const next = await appApi.beta.privyTokens(email);
    setTokens(next);
  }

  async function onReset() {
    if (tokens === null || !pinsMatch(pin, confirm)) return;
    setPending(true);
    setError(null);
    try {
      await appApi.security.resetPin({ access_token: tokens.access_token, identity_token: tokens.identity_token, pin });
      setDone(true);
    } catch (caught) {
      if (caught instanceof AppApiError) setError(caught.message);
      else setError("Something went wrong. Please try again.");
    }
    setPending(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset your PIN</DialogTitle>
        </DialogHeader>
        {done ? (
          <p role="status" aria-live="polite" className="text-gain mt-3 text-sm">
            Your PIN is reset. Other devices were signed out.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-4">
            {tokens === null && mode === "simulated" && (
              <>
                <p className="text-muted-foreground text-sm">
                  Sign in again with your email to reset your PIN.
                </p>
                <Button disabled={email === null || pending} onClick={() => void simulatedTokens()}>
                  {pending ? "Signing you in…" : "Sign in again"}
                </Button>
              </>
            )}
            {tokens === null && mode === "sandbox" && appId !== null && (
              <PrivyReset
                appId={appId}
                email={email ?? ""}
                onTokens={(next) => setTokens(next)}
              />
            )}
            {tokens !== null && (
              <>
                <PinInput id="reset-new-pin" label="New PIN" value={pin} onChange={setPin} />
                <PinInput
                  id="reset-new-pin-confirm"
                  label="Enter the new PIN again"
                  value={confirm}
                  onChange={setConfirm}
                />
                {isValidPin(pin) && isValidPin(confirm) && !pinsMatch(pin, confirm) && (
                  <p className="text-loss text-sm">Those PINs don&apos;t match.</p>
                )}
                <Button disabled={!pinsMatch(pin, confirm) || pending} onClick={() => void onReset()}>
                  {pending ? "Saving…" : "Reset PIN"}
                </Button>
              </>
            )}
            {error !== null && (
              <p role="status" aria-live="polite" className="text-loss text-sm">
                {error}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
