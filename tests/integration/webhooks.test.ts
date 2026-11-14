import { createHmac } from "node:crypto";

import { beforeEach, expect, it } from "vitest";

import { POST } from "@/app/api/v1/webhooks/yellowcard/route";
import { register, reset, rampRegistry } from "@/backend/services/ramp";
import { YellowCardProvider } from "@/backend/services/ramp/yellowcard";
import { webhookService } from "@/backend/services/webhooks";
import { db } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { makeOrder } from "../helpers/factories";

useTestDatabase();

const rawBody =
  '{"id":"8f0c4d2e","sequenceId":"dep_test_0001","status":"complete","apiKey":"test-key","event":"RECEIVE.COMPLETE","executedAt":1763017200000}';
const secret = "test-secret";

function signedHeaders(body = rawBody): Headers {
  const sig = createHmac("sha256", secret).update(body).digest("base64");
  return new Headers({ "X-YC-Signature": sig });
}

beforeEach(() => {
  reset();
  register(new YellowCardProvider({ apiKey: "test-key", secret }));
});

it("stores a signed event once and enqueues one processing job", async () => {
  const first = await webhookService.accept("yellowcard", signedHeaders(), Buffer.from(rawBody));
  const second = await webhookService.accept("yellowcard", signedHeaders(), Buffer.from(rawBody));
  expect([first.duplicate, second.duplicate]).toEqual([false, true]);
  expect(await db.webhookEvent.count()).toBe(1);
  expect(await db.job.count({ where: { kind: "webhook.process" } })).toBe(1);
});

it("records an invalid signature without queueing work or touching money", async () => {
  await expect(
    webhookService.accept("yellowcard", new Headers({ "X-YC-Signature": "AAAA" }), Buffer.from(rawBody)),
  ).rejects.toMatchObject({ statusCode: 401 });
  expect(await db.webhookEvent.findFirst()).toMatchObject({ signatureValid: false });
  expect(await db.job.count()).toBe(0);
  expect(await db.ledgerJournal.count()).toBe(0);
});

it("keeps later states of the same transaction as separate events", async () => {
  const pending = rawBody
    .replace("RECEIVE.COMPLETE", "RECEIVE.PENDING")
    .replace("1763017200000", "1763017100000");
  await webhookService.accept("yellowcard", signedHeaders(pending), Buffer.from(pending));
  await webhookService.accept("yellowcard", signedHeaders(), Buffer.from(rawBody));
  expect(await db.webhookEvent.count()).toBe(2);
});

it("routes a processed event to the owning order by provider ref or sequenceId", async () => {
  const order = await makeOrder({ id: "dep_test_0001", kind: "deposit", providerRef: null });
  await webhookService.accept("yellowcard", signedHeaders(), Buffer.from(rawBody));
  await webhookService.process("8f0c4d2e:RECEIVE.COMPLETE:1763017200000");
  expect(await db.job.count({ where: { key: `deposit.progress:${order.id}` } })).toBe(1);
  const ev = await db.webhookEvent.findFirstOrThrow({
    where: { eventKey: "8f0c4d2e:RECEIVE.COMPLETE:1763017200000" },
  });
  expect(ev.processedAt).not.toBeNull();
});

it("answers 404 when Yellow Card runs simulated", async () => {
  reset();
  const res = await callRoute(POST, {
    method: "POST",
    url: "/api/v1/webhooks/yellowcard",
    body: rawBody,
    headers: { "X-YC-Signature": "AAAA" },
  });
  expect(res.status).toBe(404);
});
