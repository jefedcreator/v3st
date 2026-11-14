import { expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";

import {
  bodyValidatorMiddleware,
  idempotencyKeyMiddleware,
  optionalAuthMiddleware,
  originMiddleware,
  pathParamValidatorMiddleware,
  queryValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import type {
  AuthRequest,
  MiddlewareResponse,
  PathParameters,
} from "@/backend/middleware/types";
import {
  depositBodySchema,
  type DepositBodySchema,
} from "@/backend/validators/deposit.validator";
import {
  eventsQuerySchema,
  type EventsQuerySchema,
} from "@/backend/validators/events.validator";
import {
  idParamSchema,
  paginationQuerySchema,
  type PaginationQuerySchema,
} from "@/backend/validators/index.validator";
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
  const handler = vi.fn(async () => ok({}, "ok"));
  const route = withMiddleware(handler, [
    bodyValidatorMiddleware(z.object({ a: z.string() }).strict()),
  ]);
  const res = await callRoute(route, {
    method: "POST",
    url: "/api/v1/x",
    body: '{"a":"x","extra":1}',
  });
  expect(res.status).toBe(422);
  expect(res.json).toMatchObject({ code: "VALIDATION_FAILED", data: null });
  expect(handler).not.toHaveBeenCalled();
});

it("carries the validated body type and transformed values into the handler", async () => {
  const route = withMiddleware<DepositBodySchema, null, null>(
    async (request) => {
      expectTypeOf(request.validatedData).toEqualTypeOf<DepositBodySchema | undefined>();
      expectTypeOf(request.params).toEqualTypeOf<null | undefined>();
      expectTypeOf(request.query).toEqualTypeOf<null | undefined>();
      const body = request.validatedData!;
      expectTypeOf(body.ngn_amount).toEqualTypeOf<bigint>();
      return ok({ ngn_amount: (body.ngn_amount + 1n).toString() }, "ok");
    },
    [bodyValidatorMiddleware(depositBodySchema)],
  );
  const res = await callRoute(route, {
    method: "POST",
    url: "/api/v1/deposits",
    body: { ngn_amount: "9007199254740993" },
  });
  expect(res.status).toBe(200);
  expect(res.json).toMatchObject({ data: { ngn_amount: "9007199254740994" } });
});

it("carries validated query types, coercion and defaults into the handler", async () => {
  const route = withMiddleware<null, null, PaginationQuerySchema>(
    async (request) => {
      expectTypeOf(request.query).toEqualTypeOf<PaginationQuerySchema | undefined>();
      expectTypeOf(request.validatedData).toEqualTypeOf<null | undefined>();
      expectTypeOf(request.params).toEqualTypeOf<null | undefined>();
      const query = request.query!;
      expectTypeOf(query.page).toEqualTypeOf<number>();
      return ok(query, "ok");
    },
    [queryValidatorMiddleware(paginationQuerySchema)],
  );
  const res = await callRoute(route, {
    method: "GET",
    url: "/api/v1/earnings?page=2",
  });
  expect(res.status).toBe(200);
  expect(res.json).toMatchObject({ data: { page: 2, size: 20 } });
});

it("validates the event resume query without rounding its cursor", async () => {
  const route = withMiddleware<null, null, EventsQuerySchema>(
    async (request) => {
      expectTypeOf(request.query!.after).toEqualTypeOf<string | undefined>();
      return ok(request.query, "ok");
    },
    [queryValidatorMiddleware(eventsQuerySchema)],
  );
  const res = await callRoute(route, {
    method: "GET",
    url: "/api/v1/events?after=9007199254740993",
  });
  expect(res.status).toBe(200);
  expect(res.json).toMatchObject({ data: { after: "9007199254740993" } });
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
  const route = withMiddleware<Uint8Array, null, null>(
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
  const route = withMiddleware<null, PathParameters, null>(
    async (request, context) => {
      expectTypeOf(request.params).toEqualTypeOf<PathParameters | undefined>();
      expectTypeOf(request.validatedData).toEqualTypeOf<null | undefined>();
      expectTypeOf(request.query).toEqualTypeOf<null | undefined>();
      expectTypeOf(request.params!.id).toEqualTypeOf<string>();
      expectTypeOf(context.params).toEqualTypeOf<PathParameters | undefined>();
      expect(context.params).toBe(request.params);
      return ok(request.params, "ok");
    },
    [pathParamValidatorMiddleware(idParamSchema)],
  );
  const res = await callRoute(route, {
    method: "GET",
    url: "/api/v1/x/ckv9q3t1b0000qz8x0abcd123",
    params: { id: "ckv9q3t1b0000qz8x0abcd123" },
  });
  expect(res.json).toMatchObject({ data: { id: "ckv9q3t1b0000qz8x0abcd123" } });
});

it("rejects invalid path parameters before calling the handler", async () => {
  const handler = vi.fn(async () => ok({}, "ok"));
  const route = withMiddleware<null, PathParameters, null>(handler, [
    pathParamValidatorMiddleware(idParamSchema),
  ]);
  const res = await callRoute(route, {
    method: "GET",
    url: "/api/v1/x/invalid",
    params: { id: "invalid" },
  });
  expect(res.status).toBe(422);
  expect(res.json).toMatchObject({ code: "VALIDATION_FAILED", data: null });
  expect(handler).not.toHaveBeenCalled();
});

it("preserves body, transformed path and query outputs in composed middleware", async () => {
  const numericPathSchema = z.object({ id: z.coerce.number().int().positive() }).strict();
  type NumericPath = z.infer<typeof numericPathSchema>;
  const pathMiddleware = pathParamValidatorMiddleware(numericPathSchema);
  expectTypeOf(pathMiddleware).parameter(0).toEqualTypeOf<
    Pick<AuthRequest<null, NumericPath, null>, "parsedParams" | "params">
  >();
  const route = withMiddleware<DepositBodySchema, NumericPath, PaginationQuerySchema>(
    async (request, context) => {
      expectTypeOf(request.validatedData).toEqualTypeOf<DepositBodySchema | undefined>();
      expectTypeOf(request.params).toEqualTypeOf<NumericPath | undefined>();
      expectTypeOf(request.query).toEqualTypeOf<PaginationQuerySchema | undefined>();
      expectTypeOf(context.params).toEqualTypeOf<NumericPath | undefined>();
      return ok(
        {
          amount: request.validatedData!.ngn_amount.toString(),
          id: request.params!.id,
          context_id: context.params!.id,
          page: request.query!.page,
          size: request.query!.size,
        },
        "ok",
      );
    },
    [
      bodyValidatorMiddleware(depositBodySchema),
      pathMiddleware,
      queryValidatorMiddleware(paginationQuerySchema),
    ],
  );
  const res = await callRoute(route, {
    method: "POST",
    url: "/api/v1/x/42?page=2",
    params: { id: "42" },
    body: { ngn_amount: "9007199254740993" },
  });
  expect(res.status).toBe(200);
  expect(res.json).toMatchObject({
    data: { amount: "9007199254740993", id: 42, context_id: 42, page: 2, size: 20 },
  });
});

it("leaves unused body, path and query outputs absent with null contracts", async () => {
  const route = withMiddleware<null, null, null>(async (request, context) => {
    expectTypeOf(request.validatedData).toEqualTypeOf<null | undefined>();
    expectTypeOf(request.params).toEqualTypeOf<null | undefined>();
    expectTypeOf(request.query).toEqualTypeOf<null | undefined>();
    expectTypeOf(context.params).toEqualTypeOf<null | undefined>();
    expect(request.validatedData).toBeUndefined();
    expect(request.params).toBeUndefined();
    expect(request.query).toBeUndefined();
    expect(context.params).toBeUndefined();
    return ok({}, "ok");
  }, [optionalAuthMiddleware]);
  const res = await callRoute(route, { method: "GET", url: "/api/v1/x" });
  expect(res.status).toBe(200);
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
  const asCookie = async (
    req: AuthRequest<null, null, null>,
  ): Promise<MiddlewareResponse> => {
    req.authTransport = "cookie";
    return { message: "", statusCode: 200, next: true };
  };
  const route = withMiddleware<null, null, null>(async () => ok({}, "ok"), [
    asCookie,
    originMiddleware,
  ]);
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
