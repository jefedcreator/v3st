import { describe, expect, it } from "vitest";

import { waitlistBodySchema } from "@/backend/validators/waitlist.validator";

describe("waitlist body schema", () => {
  it("trims and lowercases the email", () => {
    expect(waitlistBodySchema.parse({ email: "  Ada@Example.COM " })).toMatchObject({
      email: "ada@example.com",
    });
  });

  it("defaults source to hero", () => {
    expect(waitlistBodySchema.parse({ email: "a@b.co" }).source).toBe("hero");
  });

  it("rejects unknown keys", () => {
    expect(waitlistBodySchema.safeParse({ email: "a@b.co", extra: "x" }).success).toBe(false);
  });

  it("rejects a source of footer", () => {
    expect(waitlistBodySchema.safeParse({ email: "a@b.co", source: "footer" }).success).toBe(false);
  });

  it("rejects website longer than 200 characters", () => {
    expect(
      waitlistBodySchema.safeParse({ email: "a@b.co", website: "x".repeat(201) }).success,
    ).toBe(false);
  });
});
