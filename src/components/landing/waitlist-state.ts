// Browser-safe waitlist form logic: a pure reducer plus the API-outcome
// mapping. No server imports.

export type WaitlistState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "joined"; email: string }
  | { kind: "error"; message: string; field: "email" | null };

export type WaitlistEvent =
  | { type: "submit" }
  | { type: "succeeded"; email: string }
  | { type: "failed"; message: string; field: "email" | null }
  | { type: "edit" };

export function waitlistReducer(state: WaitlistState, event: WaitlistEvent): WaitlistState {
  switch (event.type) {
    case "submit":
      return { kind: "submitting" };
    case "succeeded":
      return { kind: "joined", email: event.email };
    case "failed":
      return { kind: "error", message: event.message, field: event.field };
    case "edit":
      // Joined is terminal; an error can be edited away.
      return state.kind === "error" ? { kind: "idle" } : state;
  }
}

export const WAITLIST_FALLBACK_MESSAGE = "Something went wrong. Please try again.";

export function toWaitlistOutcome(
  status: number,
  body: unknown,
): { ok: true } | { ok: false; message: string; field: "email" | null } {
  if (status >= 200 && status < 300) return { ok: true };
  const parsed = body as { message?: unknown } | null;
  const message =
    parsed && typeof parsed.message === "string" && parsed.message.length > 0
      ? parsed.message
      : WAITLIST_FALLBACK_MESSAGE;
  return { ok: false, message, field: status === 422 ? "email" : null };
}
