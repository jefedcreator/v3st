import { describe, expect, it } from "vitest";
import { z } from "zod";

import { bodyValidatorMiddleware, withMiddleware } from "@/backend/middleware";
import {
  CUSTOMER_ERROR_COPY,
  customerErrorFor,
} from "@/backend/services/app/copy";
import { findCustomerLeaks } from "@/backend/services/app/vocabulary";
import { minorAmountSchema } from "@/backend/validators/index.validator";
import { ServiceUnavailableException } from "@/utils/exceptions";

import { callRoute } from "../helpers/http";

describe("customer error copy", () => {
  it("gives every internal code clean customer copy", () => {
    for (const [code, copy] of Object.entries(CUSTOMER_ERROR_COPY)) {
      expect(findCustomerLeaks({ message: copy.message }), code).toEqual([]);
    }
    expect(customerErrorFor("NETWORK_UNHEALTHY")).toBe(CUSTOMER_ERROR_COPY.NETWORK_UNHEALTHY);
  });

  it("hides internal messages from the customer audience", async () => {
    const route = withMiddleware<null, null, null>(
      async () => {
        throw new ServiceUnavailableException("Testnet unavailable: rpc down", "NETWORK_UNHEALTHY");
      },
      [],
      { audience: "customer" },
    );
    const res = await callRoute(route, { method: "GET", url: "/api/v1/app/probe" });
    expect(res.status).toBe(503);
    expect(res.json).toEqual({
      status: 503,
      code: "TEMPORARILY_UNAVAILABLE",
      message: CUSTOMER_ERROR_COPY.NETWORK_UNHEALTHY.message,
      data: null,
    });
  });

  it("names the field on customer validation errors and leaves the internal audience unchanged", async () => {
    const schema = z.object({ amount_kobo: minorAmountSchema }).strict();
    const handler = async () => new Response("ok", { status: 200 });

    const customer = withMiddleware(handler, [bodyValidatorMiddleware(schema)], {
      audience: "customer",
    });
    const customerRes = await callRoute(customer, {
      method: "POST",
      url: "/api/v1/app/probe",
      body: { amount_kobo: "abc" },
    });
    expect(customerRes.status).toBe(422);
    expect(customerRes.json).toEqual({
      status: 422,
      code: "CHECK_DETAILS",
      message: "Check the amount and try again.",
      data: null,
    });

    const internal = withMiddleware(handler, [bodyValidatorMiddleware(schema)]);
    const internalRes = await callRoute(internal, {
      method: "POST",
      url: "/api/v1/probe",
      body: { amount_kobo: "abc" },
    });
    expect(internalRes.status).toBe(422);
    const body = internalRes.json as { code: string; message: string };
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.message).toContain("amount_kobo");
  });
});
