"use client";

import * as React from "react";

import { formatLagosDateTime } from "@/utils/format";
import { AppApiError, useDevicesQuery, useSettingsActions } from "@/hooks/app/use-settings";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@/primitives";

function messageOf(caught: unknown): string {
  return caught instanceof AppApiError ? caught.message : "Something went wrong. Please try again.";
}

// Signed-in devices: this one, and signing out the others. Stays open.
export function DevicesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data, error: loadError, isPending } = useDevicesQuery();
  const { revokeSession, signOutOthers } = useSettingsActions();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const devices = data ?? [];
  const others = devices.filter((device) => !device.current);

  async function run(id: string, action: () => Promise<void>) {
    setBusy(id);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(messageOf(caught));
    }
    setBusy(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Signed-in devices</DialogTitle>
          <DialogDescription>Where your account is signed in right now.</DialogDescription>
        </DialogHeader>
        {isPending && (
          <div className="flex flex-col gap-3" aria-hidden="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {loadError !== null && devices.length === 0 && (
          <p role="status" className="text-loss text-sm">
            {messageOf(loadError)}
          </p>
        )}
        <ul className="flex flex-col">
          {devices.map((device) => (
            <li
              key={device.id}
              className="flex items-center justify-between gap-3 border-b border-stroke py-3 last:border-b-0"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-heading text-[15px] break-words">{device.device}</span>
                <span className="text-muted-foreground text-sm">
                  Signed in {formatLagosDateTime(device.signed_in_at)}
                </span>
                {device.current && <span className="text-gain text-sm">This device</span>}
              </span>
              {!device.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  disabled={busy !== null}
                  onClick={() => void run(device.id, () => revokeSession(device.id))}
                >
                  {busy === device.id ? "Signing out…" : "Sign out"}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {others.length > 0 && (
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() => void run("others", signOutOthers)}
          >
            {busy === "others" ? "Signing out…" : "Sign out of other devices"}
          </Button>
        )}
        <p role="status" aria-live="polite" className="text-loss text-sm empty:hidden">
          {error}
        </p>
      </DialogContent>
    </Dialog>
  );
}
