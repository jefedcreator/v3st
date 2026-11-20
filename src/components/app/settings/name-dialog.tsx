"use client";

import * as React from "react";

import { AppApiError, useSettingsActions } from "@/hooks/app/use-settings";
import { isValidPreferredName } from "./settings";
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

  const trimmed = text.trim();
  const valid = trimmed === "" || isValidPreferredName(trimmed);

  async function onSave() {
    setPending(true);
    setError(null);
    try {
      await updateName(text.trim() === "" ? null : text.trim());
      onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof AppApiError ? caught.message : "Something went wrong. Please try again.",
      );
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your name</DialogTitle>
          <DialogDescription>The name V3ST greets you by.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !pending) void onSave();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="preferred-name">What should we call you?</Label>
            <Input
              id="preferred-name"
              value={text}
              autoComplete="given-name"
              aria-invalid={!valid}
              aria-describedby="preferred-name-hint"
              maxLength={40}
              onChange={(event) => setText(event.target.value)}
            />
            <p id="preferred-name-hint" className="text-subtle text-sm">
              Letters only, up to 40 characters. Leave it empty to use your verified first name.
            </p>
          </div>
          <Button type="submit" disabled={!valid || pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <p role="status" aria-live="polite" className="text-loss text-sm empty:hidden">
            {error}
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
