"use client";

import * as React from "react";

import { appApi, AppApiError } from "@/utils/app-api";
import type { AppTestIdentityDto } from "@/types/app";
import { Button, Label, RadioGroup, RadioGroupItem } from "@/primitives";

export function IdentityStep({
  identities,
  onDone,
}: {
  identities: AppTestIdentityDto[];
  onDone: () => void;
}) {
  const [choice, setChoice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (choice === null) return;
    setPending(true);
    setError(null);
    setStatus(null);
    try {
      const res = await appApi.identity.verify(choice);
      if (!res.verified) {
        setStatus("This test identity wasn't verified. Choose another one.");
        setPending(false);
        return;
      }
      onDone();
    } catch (caught) {
      setError(caught instanceof AppApiError ? caught.message : "Something went wrong. Please try again.");
      setPending(false);
    }
  }

  const statusId = "identity-status";
  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <div className="flex flex-col gap-3">
        <p id="identity-label" className="text-foreground text-sm font-medium">
          Test identity
        </p>
        <RadioGroup
          aria-labelledby="identity-label"
          aria-describedby={statusId}
          name="test-identity"
          value={choice ?? undefined}
          onValueChange={setChoice}
          className="gap-3"
        >
          {identities.map((identity) => (
            <Label
              key={identity.id}
              htmlFor={`identity-${identity.id}`}
              className="has-[[data-state=checked]]:border-signal flex min-h-11 items-center gap-3 rounded-lg border border-stroke bg-surface px-4 py-3 font-normal transition-colors hover:bg-surface-raised"
            >
              <RadioGroupItem id={`identity-${identity.id}`} value={identity.id} />
              <span className="flex flex-col">
                <span className="text-ink font-medium">{identity.name}</span>
                <span className="text-muted-foreground text-sm">{identity.description}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </div>
      <p className="text-subtle text-sm" id={statusId}>
        In the beta you choose a test identity instead of giving your BVN.
      </p>
      <Button type="submit" disabled={choice === null || pending}>
        {pending ? "Checking…" : "Continue"}
      </Button>
      {(error !== null || status !== null) && (
        <p role="status" aria-live="polite" className="text-loss text-sm">
          {error ?? status}
        </p>
      )}
    </form>
  );
}
