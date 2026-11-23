"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { appApi } from "@/utils/app-api";
import { afterSignInPath } from "@/utils/app-paths";
import { Button, Input, Label } from "@/primitives";
import { isValidEmail, signinErrorMessage } from "./signin";

export function SimulatedSignin({ next }: { next: string | null }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const valid = isValidEmail(email);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setPending(true);
    setError(null);
    try {
      const tokens = await appApi.beta.privyTokens(email);
      const res = await appApi.auth.privy(tokens);
      router.replace(afterSignInPath(res.next_step, next));
    } catch (caught) {
      setError(signinErrorMessage(caught));
      setPending(false);
    }
  }

  const errorId = "signin-email-error";
  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="signin-email">Email</Label>
        <Input
          id="signin-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          aria-invalid={error !== null}
          aria-describedby={error !== null ? errorId : undefined}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={!valid || pending}>
        {pending ? "Signing you in…" : "Continue"}
      </Button>
      {error !== null && (
        <p id={errorId} role="status" aria-live="polite" className="text-loss text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
