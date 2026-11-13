import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, it } from "vitest";

import { createYellowCardClient } from "@/backend/services/ramp/yellowcard/client";
import { YellowCardProvider } from "@/backend/services/ramp/yellowcard";
import { mapYellowCardStatus } from "@/backend/services/ramp/yellowcard/mapping";
import type { Customer } from "@/backend/services/ramp/types";

const fixtureDir = path.resolve(import.meta.dirname, "fixtures/yellowcard");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixtureDir, `${name}.json`), "utf8"));
}

function recordingFetch(calls: Request[], fixtureBody: unknown, status = 201) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const req = new Request(input as Request);
    calls.push(req);
    return new Response(JSON.stringify(fixtureBody), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

function routerFetch(routes: Record<string, [number, unknown]>) {
  const calls: Request[] = [];
  const fn = async (input: RequestInfo | URL): Promise<Response> => {
    const req = new Request(input as Request);
    calls.push(req);
    const url = new URL(req.url);
    const key = `${req.method} ${url.pathname.replace("/business", "")}${url.search}`;
    const route = routes[key] ?? routes[`${req.method} ${url.pathname.replace("/business", "")}`];
    if (!route) {
      return new Response(JSON.stringify({ code: "NotFound", message: "no fixture" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(route[1]), {
      status: route[0],
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fn: fn as typeof fetch };
}

const signing = {
  apiKey: "test-key",
  secret: "test-secret",
  clock: () => new Date("2026-11-13T07:00:00.000Z"),
};

const customer: Customer = {
  userId: "u1",
  name: "ADAEZE OBI",
  phone: "+23400000000001",
  country: "NG",
  dateOfBirth: null,
  idType: "BVN",
  idNumber: null,
  address: null,
};

it("signs a POST exactly as documented", async () => {
  const calls: Request[] = [];
  const client = createYellowCardClient({
    ...signing,
    fetch: recordingFetch(calls, fixture("receive-submit-201")),
  });
  await client.request("POST", "/receive", { sequenceId: "dep_test_0001", localAmount: 20000 });
  expect(calls[0]!.url).toBe("https://sandbox.api.yellowcard.io/business/receive");
  expect(calls[0]!.headers.get("X-YC-Timestamp")).toBe("2026-11-13T07:00:00.000Z");
  expect(calls[0]!.headers.get("Authorization")).toBe(
    "YcHmacV1 test-key:Elz/7FW0xziKmO3Q3hrcinRA2TFEKsqCpgjj9Keg6M0=",
  );
  expect(await calls[0]!.text()).toBe('{"sequenceId":"dep_test_0001","localAmount":20000}');
});

it("signs a GET without query string or body hash", async () => {
  const calls: Request[] = [];
  await createYellowCardClient({
    ...signing,
    fetch: recordingFetch(calls, fixture("rates"), 200),
  }).request("GET", "/rates?currency=NGN");
  expect(calls[0]!.headers.get("Authorization")).toBe(
    "YcHmacV1 test-key:hh9FaxXNpTS26Q/kvT0fgV5IYZK5A3XC4lq0TRM52Yk=",
  );
});

it("verifies webhook signatures over the exact raw bytes", () => {
  const raw =
    '{"id":"8f0c4d2e","sequenceId":"dep_test_0001","status":"complete","apiKey":"test-key","event":"RECEIVE.COMPLETE","executedAt":1763017200000}';
  const yc = new YellowCardProvider({ apiKey: "test-key", secret: "test-secret" });
  const sig = (s: string) => new Headers({ "X-YC-Signature": s });
  expect(
    yc.verifyWebhook(sig("N0//PxixFw11aQwDdLsR6/U9/VLrH4f+OikGr34rYJw="), Buffer.from(raw)),
  ).toBe(true);
  expect(
    yc.verifyWebhook(
      sig("N0//PxixFw11aQwDdLsR6/U9/VLrH4f+OikGr34rYJw="),
      Buffer.from(raw.replace("complete", "completE")),
    ),
  ).toBe(false);
  expect(
    yc.verifyWebhook(sig("N0__PxixFw11aQwDdLsR6_U9_VLrH4f-OikGr34rYJw"), Buffer.from(raw)),
  ).toBe(false); // base64url is rejected
});

it("maps a completed receive to exact integer amounts", async () => {
  const { calls, fn } = routerFetch({
    "GET /receive/8f0c4d2e": [200, fixture("receive-get-complete")],
  });
  const yc = new YellowCardProvider({ apiKey: "test-key", secret: "test-secret", fetch: fn });
  const tx = await yc.getTransaction("in", "8f0c4d2e");
  expect(tx).toMatchObject({
    state: "complete",
    ngnAmount: 2_000_000n,
    usdAmount: 12_375_000n,
    feeNgn: 20_000n,
    senderName: "ADAEZE OBI",
  });
  expect(calls[0]!.url).toBe("https://sandbox.api.yellowcard.io/business/receive/8f0c4d2e");
});

it("maps documented and unknown statuses", () => {
  expect(mapYellowCardStatus("refund_failed")).toBe("hold");
  expect(mapYellowCardStatus("pending_approval")).toBe("pending");
  expect(mapYellowCardStatus("denied")).toBe("failed");
  expect(mapYellowCardStatus("brand_new_status")).toBe("hold");
  expect(mapYellowCardStatus("complete")).toBe("complete");
  expect(mapYellowCardStatus("refunded")).toBe("refunded");
});

it("does not accept a send whose locked cost exceeds maxUsd", async () => {
  const { calls, fn } = routerFetch({
    "GET /rates?currency=NGN": [200, fixture("rates")],
    "POST /send": [201, fixture("send-submit-201")],
  });
  const yc = new YellowCardProvider({ apiKey: "test-key", secret: "test-secret", fetch: fn });
  const quote = await yc.quote("out", 500_000n);
  await expect(
    yc.createPayout({
      quote,
      destination: { bankCode: "044", accountNumber: "0123456789", accountName: "ADAEZE OBI" },
      customer,
      key: "w1",
      maxUsd: 3_225_806n,
    }),
  ).rejects.toMatchObject({ kind: "rate_moved" });
  expect(calls.some((c) => c.url.endsWith("/accept"))).toBe(false);
});

it("classifies a timeout as transient and a validation 400 as rejected", async () => {
  const hanging = (async () => new Promise<Response>(() => {})) as typeof fetch;
  const client = createYellowCardClient({ ...signing, fetch: hanging, timeoutMs: 10 });
  await expect(client.request("GET", "/rates?currency=NGN")).rejects.toMatchObject({
    kind: "transient",
  });

  const badRequest = recordingFetch([], { code: "ValidationError", message: "bad input" }, 400);
  const client2 = createYellowCardClient({ ...signing, fetch: badRequest });
  await expect(client2.request("POST", "/receive", { sequenceId: "x" })).rejects.toMatchObject({
    kind: "rejected",
    code: "ValidationError",
  });
});
