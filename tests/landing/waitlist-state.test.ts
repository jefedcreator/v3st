import { expect, it } from "vitest";

import {
  toWaitlistOutcome,
  waitlistReducer,
} from "@/components/landing/waitlist-state";

it("moves idle → submitting → joined", () => {
  const s = waitlistReducer(
    waitlistReducer({ kind: "idle" }, { type: "submit" }),
    { type: "succeeded", email: "a@b.co" },
  );
  expect(s).toEqual({ kind: "joined", email: "a@b.co" });
});

it("keeps joined terminal and lets an error be edited away", () => {
  expect(waitlistReducer({ kind: "joined", email: "a@b.co" }, { type: "edit" })).toEqual({
    kind: "joined",
    email: "a@b.co",
  });
  expect(
    waitlistReducer({ kind: "error", message: "x", field: "email" }, { type: "edit" }),
  ).toEqual({ kind: "idle" });
});

it("reads API outcomes", () => {
  expect(toWaitlistOutcome(200, { data: { joined: true } })).toEqual({ ok: true });
  expect(
    toWaitlistOutcome(422, {
      code: "CHECK_DETAILS",
      message: "Enter a valid email address.",
    }),
  ).toEqual({ ok: false, message: "Enter a valid email address.", field: "email" });
  expect(
    toWaitlistOutcome(429, {
      code: "TOO_MANY_TRIES",
      message: "Too many tries. Please wait a few minutes and try again.",
    }),
  ).toEqual({
    ok: false,
    message: "Too many tries. Please wait a few minutes and try again.",
    field: null,
  });
  expect(toWaitlistOutcome(500, null)).toEqual({
    ok: false,
    message: "Something went wrong. Please try again.",
    field: null,
  });
});
