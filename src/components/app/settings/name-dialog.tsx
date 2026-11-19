"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { useSettingsActions } from "@/hooks/app/use-settings";
import { identityLine, isValidPreferredName } from "./settings";
import type { AppProfileDto } from "@/types/app";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/primitives";
import { Input, Label } from "@/primitives";

export function NameDialog({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  profile: AppProfileDto;
}) {
  const router = useRouter();
  const { updateName } = useSettingsActions();
  const [text, setText] = React.useState(profile.preferred_name ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setText(profile.preferred_name ?? "");
      setError(null);
    }
  }, [open, profile.preferred_name]);

  const valid = text === "" || isValidPreferredName(text);

  async function onSave() {
    setPending(true);
    setError(null);
    try {
      await updateName(text === "" ? null : text);
      onOpenChange(false);
      router.refresh();
    } catch {
      setError("That didn't save. Please try again.");
    }
    setPending(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your name</DialogTitle>
          <DialogDescription>
            Letters only, up to 40 characters. Leave it empty to use your verified first name.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="preferred-name">What should we call you?</Label>
            <Input
              id="preferred-name"
              value={text}
              aria-invalid={!valid}
              maxLength={40}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <p className="text-muted-foreground text-sm">{identityLine(profile)}</p>
          <Button disabled={!valid || pending} onClick={() => void onSave()}>
            {pending ? "Saving…" : "Save"}
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
