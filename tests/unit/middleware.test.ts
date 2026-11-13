import { expect, it } from "vitest";
import { z } from "zod";

import {
  bodyValidatorMiddleware,
  idempotencyKeyMiddleware,
  originMiddleware,
  pathParamValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import type { AuthRequest, MiddlewareResponse } from "@/backend/middleware/types";
import { idParamSchema } from "@/backend/validators/index.validator";
import { ok } from "@/utils/response";
import { redact } from "@/utils";

import { callRoute } from "../helpers/http";

it("returns 400 MALFORMED_JSON for an unparseable body", async () => {
  const res = await callRoute(withMiddleware(async () => ok({}, "ok"), []), {
    method: "POST",
    url: "/api/v1/x",
    body: '{"a":',
  });
  expect(res.status).toBe(400);
  expect(res.json).toEqual({
    status: 400,
    message: "Malformed JSON body",
    code: "MALFORMED_JSON",
    data: null,
  });
});

it("returns 422 VALIDATION_FAILED for unknown keys", async () => {
  const route = withMiddleware(async () => ok({}, "ok"), [
    bodyValidatorMiddleware(z.object({ a: z.string() }).strict()),
  ]);
  const res = await callRoute(route, {
    method: "POST",
    url: "/api/v1/x",
    body: '{"a":"x","extra":1}',
  });
  expect(res.status).toBe(422);
  expect(res.json).toMatchObject({ code: "VALIDATION_FAILED", data: null });
});

it("hides the detail of unexpected errors", async () => {
  const res = await callRoute(
    withMiddleware(async () => {
      throw new Error('relation "secret_table" does not exist');
    }, []),
    { method: "GET", url: "/api/v1/x" },
  );
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.json)).not.toContain("secret_table");
  expect(res.json).toMatchObject({ message: "Internal server error", code: "INTERNAL" });
});

it("preserves raw webhook bytes", async () => {
  const body = '{ "a":1,  "b" : [1,2] }';
  let seen: Uint8Array | undefined;
  const route = withMiddleware(
    async (req) => {
      seen = req.rawBody;
      return ok({}, "ok");
    },
    [],
    { bodyMode: "raw" },
  );
  await callRoute(route, { method: "POST", url: "/api/v1/webhooks/x", body });
  expect(Buffer.from(seen!).toString("utf8")).toBe(body);
});

it("rejects bodies over 64 KiB with 413", async () => {
  const res = await callRoute(withMiddleware(async () => ok({}, "ok"), []), {
    method: "POST",
    url: "/api/v1/x",
    body: JSON.stringify({ a: "x".repeat(70_000) }),
  });
  expect(res.status).toBe(413);
});

it("awaits Next 15 params", async () => {
  const route = withMiddleware(async (req) => ok(req.params, "ok"), [
    pathParamValidatorMiddleware(idParamSchema),
  ]);
  const res = await callRoute(route, {
    method: "GET",
    url: "/api/v1/x/ckv9q3t1b0000qz8x0abcd123",
    params: { id: "ckv9q3t1b0000qz8x0abcd123" },
  });
  expect(res.json).toMatchObject({ data: { id: "ckv9q3t1b0000qz8x0abcd123" } });
});

it("requires a well-formed Idempotency-Key", async () => {
  const route = withMiddleware(async () => ok({}, "ok"), [idempotencyKeyMiddleware]);
  expect(
    (await callRoute(route, { method: "POST", url: "/x", body: "{}" })).json,
  ).toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
  expect(
    (
      await callRoute(route, {
        method: "POST",
        url: "/x",
        body: "{}",
        headers: { "Idempotency-Key": "bad key!" },
      })
    ).status,
  ).toBe(400);
});

it("rejects cross-origin cookie mutations", async () => {
  const asCookie = async (req: AuthRequest): Promise<MiddlewareResponse> => {
    req.authTransport = "cookie";
    return { message: "", statusCode: 200, next: true };
  };
  const route = withMiddleware(async () => ok({}, "ok"), [asCookie, originMiddleware]);
  const res = await callRoute(route, {
    method: "POST",
    url: "/x",
    body: "{}",
    headers: { Origin: "https://evil.test" },
  });
  expect(res.status).toBe(403);
  expect(res.json).toMatchObject({ code: "CROSS_ORIGIN" });
});

it("redacts secrets and identifiers in logs", () => {
  expect(
    redact({
      identity_token: "t",
      nested: { account_number: "0123456789", phone: "+2340000000001" },
      amount: "5",
    }),
  ).toEqual({
    identity_token: "[redacted]",
    nested: { account_number: "[redacted]", phone: "[redacted]" },
    amount: "5",
  });
});
