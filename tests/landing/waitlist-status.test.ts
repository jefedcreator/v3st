import { expect, it } from "vitest";

import { waitlistStatusCopy } from "@/components/landing/waitlist-status";

it("maps result statuses to copy", () => {
  expect(waitlistStatusCopy("joined")).toEqual({
    tone: "success",
    message: "You're on the list. We'll email you when a beta place opens.",
  });
  expect(waitlistStatusCopy("check_details")).toEqual({
    tone: "error",
    message: "Enter a valid email address.",
  });
  expect(waitlistStatusCopy("too_many_tries")).toEqual({
    tone: "error",
    message: "Too many tries. Please wait a few minutes and try again.",
  });
  expect(waitlistStatusCopy("not_allowed")!.tone).toBe("error");
  expect(waitlistStatusCopy(undefined)).toBeNull();
  expect(waitlistStatusCopy("<script>")).toBeNull();
});
