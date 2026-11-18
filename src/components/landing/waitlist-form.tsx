"use client";

import * as React from "react";

import { Button } from "@/primitives/button";
import type { WaitlistSource } from "@/types/landing";
import { cn } from "@/utils/cn";

import {
  WAITLIST_FALLBACK_MESSAGE,
  toWaitlistOutcome,
  waitlistReducer,
  type WaitlistState,
} from "./waitlist-state";

const SUCCESS_COPY = "You're on the list. We'll email you when a beta place opens.";

// The progressive waitlist form: a native <form method="post"
// action="/api/v1/waitlist"> that works without JavaScript, enhanced with a
// JSON fetch when JavaScript is available. Results are announced in a polite
// live region and every state keeps the same height.
export function WaitlistForm(props: { source: WaitlistSource; inputId: string }): React.JSX.Element {
  const [state, dispatch] = React.useReducer(
    waitlistReducer,
    { kind: "idle" } satisfies WaitlistState,
  );
  const [email, setEmail] = React.useState("");
  const liveId = `${props.inputId}-status`;

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.kind === "submitting" || state.kind === "joined") return;
    dispatch({ type: "submit" });
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          source: data.get("source"),
          website: data.get("website"),
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      const outcome = toWaitlistOutcome(response.status, body);
      if (outcome.ok) {
        dispatch({ type: "succeeded", email });
      } else {
        dispatch({ type: "failed", message: outcome.message, field: outcome.field });
      }
    } catch {
      dispatch({ type: "failed", message: WAITLIST_FALLBACK_MESSAGE, field: null });
    }
  };

  const error = state.kind === "error" ? state : null;

  return (
    <div className="waitlist-wrap">
      {state.kind !== "joined" ? (
        <form
          method="post"
          action="/api/v1/waitlist"
          onSubmit={onSubmit}
          className="waitlist-form"
        >
          <label htmlFor={props.inputId} className="sr-only">
            Email address
          </label>
          <input
            type="email"
            name="email"
            id={props.inputId}
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            className="waitlist-input"
            value={email}
            readOnly={state.kind === "submitting"}
            aria-invalid={error?.field === "email" ? true : undefined}
            aria-describedby={error ? liveId : undefined}
            onChange={(event) => {
              setEmail(event.target.value);
              if (state.kind === "error") dispatch({ type: "edit" });
            }}
          />
          <input type="hidden" name="source" value={props.source} />
          <span className="waitlist-honeypot" aria-hidden="true">
            <input name="website" tabIndex={-1} autoComplete="off" />
          </span>
          <Button type="submit" disabled={state.kind === "submitting"}>
            {state.kind === "submitting" ? "Joining…" : "Join the waitlist"}
          </Button>
        </form>
      ) : null}
      <p
        id={liveId}
        role="status"
        aria-live="polite"
        className={cn("waitlist-live", state.kind === "joined" && "waitlist-success")}
      >
        {state.kind === "joined" ? SUCCESS_COPY : error ? error.message : ""}
      </p>
      <p className="waitlist-microcopy">
        Beta · test money only. We&apos;ll only use your email to invite you.{" "}
        <a href="/legal/privacy">Privacy</a>
      </p>
    </div>
  );
}
