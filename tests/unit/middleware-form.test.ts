import { describe, expect, it } from "vitest";
import { z } from "zod";

import { bodyValidatorMiddleware, withMiddleware } from "@/backend/middleware";
import { ok } from "@/utils/response";

import { callRoute } from "../helpers/http";

const handler = withMiddleware<{ email: string }, null, null>(
  async () => ok({ joined: true }, "ok"),
  [bodyValidatorMiddleware(z.object({ email: z.string().email() }).strict())],
  {
    audience: "customer",
    bodyMode: "form",
    formRedirect: { path: "/waitlist", successStatus: "joined" },
  },
);

function form(body: string) {
  return {
    method: "POST",
    url: "/x",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  };
}

describe("form body mode and form redirects", () => {
  it("answers JSON requests with the normal envelope", async () => {
    const res = await callRoute(handler, { method: "POST", url: "/x", body: { email: "a@b.co" } });
    expect(res.status).toBe(200);
  });

  it("redirects a url-encoded success to the success status", async () => {
    const res = await callRoute(handler, form("email=a%40b.co"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3000/waitlist?status=joined");
  });

  it("redirects a url-encoded validation failure to the customer code", async () => {
    expect((await callRoute(handler, form("email=nope"))).headers.get("location")).toBe(
      "http://localhost:3000/waitlist?status=check_details",
    );
  });

  it("rejects repeated keys", async () => {
    expect(
      (await callRoute(handler, form("email=a%40b.co&email=c%40d.co"))).headers.get("location"),
    ).toBe("http://localhost:3000/waitlist?status=check_details");
  });

  it("rejects other content types with CHECK_DETAILS", async () => {
    const res = await callRoute(handler, {
      method: "POST",
      url: "/x",
      body: "email=a",
      headers: { "content-type": "text/plain" },
    });
    expect(res.status).toBe(400);
    expect((res.json as { code: string }).code).toBe("CHECK_DETAILS");
  });
});
