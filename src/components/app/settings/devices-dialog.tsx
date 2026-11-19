"use client";

import * as React from "react";

import type { AppDeviceSessionDto } from "@/types/app";
import { formatLagosDateTime } from "@/utils/format";
import { useDevicesQuery, useSettingsActions } from "@/hooks/app/use-settings";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@/primitives";

// Signed-in devices: this one, and signing out the others.
export function DevicesDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: AppDeviceSessionDto[];
}) {
  const { data } = useDevicesQuery();
  const { revokeSession, signOutOthers } = useSettingsActions();
  const [error, setError] = React.useState<string | null>(null);
  const devices = data ?? initial ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Signed-in devices</DialogTitle>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-4">
          <ul className="flex flex-col gap-3">
            {devices.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-ink text-[15px]">{device.device}</span>
                  <span className="text-muted-foreground text-sm">
                    Signed in {formatLagosDateTime(device.signed_in_at)}
                  </span>
                  {device.current && <span className="text-gain text-sm">This device</span>}
                </span>
                {!device.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await revokeSession(device.id);
                      } catch {
                        setError("That didn't sign out. Please try again.");
                      }
                    }}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await signOutOthers();
              } catch {
                setError("That didn't sign out. Please try again.");
              }
            }}
          >
            Sign out of other devices
          </Button>
          {error !== null && (
            <p role="status" aria-live="polite" className="text-loss text-sm">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
