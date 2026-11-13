import { randomBytes, randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import type { User } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { depositService } from "@/backend/services/deposits";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { walletService } from "@/backend/services/wallets";
import { POST as depositsPOST } from "@/app/api/v1/deposits/route";
import { POST as scenariosPOST } from "@/app/api/v1/beta/scenarios/route";

import { callRoute } from "../helpers/http";
import { useTestDatabase } from "../helpers/db";
import {
  makeBankAccount,
  makeOrder,
  makeVerifiedUser,
  seedTreasury,
} from "../helpers/factories";
import { setNow } from "../helpers/time";
import { drainJobs } from "../helpers/worker";

useTestDatabase();

let ada: User;
let adaToken: string;

async function sessionFor(u: User): Promise<string> {
  const sessionToken = randomBytes(32).toString("base64url");
  await db.session.create({
    data: {
      sessionToken,
      userId: u.id,
      expires: new Date(now().getTime() + 86_400_000),
    },
  });
  return sessionToken;
}

beforeEach(async () => {
  setNow("2026-11-13T09:00:00Z");
  await seedTreasury("base", 1_000_000_000_000n);
  ada = await makeVerifiedUser("ada_tier2");
  await makeBankAccount(ada.id);
  await walletService.ensureUserWallets(ada.id);
  adaToken = await sessionFor(ada);
});

function authHeaders(token: string, key?: string) {
  return {
    cookie: `sara-session=${token}`,
    origin: "http://localhost:3000",
    ...(key ? { "idempotency-key": key } : {}),
  };
}

async function createDeposit(ngnAmount: string) {
  const res = await callRoute(depositsPOST, {
    method: "POST",
    url: "http://localhost:3000/api/v1/deposits",
    body: JSON.stringify({ ngn_amount: ngnAmount }),
    headers: authHeaders(adaToken, randomUUID()),
  });
  expect([200, 201, 202]).toContain(res.status);
  return (res.json as { data: { id: string } }).data;
}

async function postScenario(token: string, body: unknown) {
  return callRoute(scenariosPOST, {
    method: "POST",
    url: "http://localhost:3000/api/v1/beta/scenarios",
    body: JSON.stringify(body),
    headers: authHeaders(token),
  });
}

describe("beta scenarios", () => {
  it("completes a simulated deposit end to end through the scenario API", async () => {
    const d = await createDeposit("2000000");
    const res = await postScenario(adaToken, { order_id: d.id, scenario: "deposit_paid" });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      data: { order_id: d.id, scenario: "deposit_paid" },
    });
    expect(await db.ledgerJournal.count({ where: { orderId: d.id } })).toBe(0);
    await drainJobs();
    const dto = await depositService.get(ada.id, d.id);
    expect(dto.status).toBe("settled");
    expect(await ledgerService.balance(acct.userCash(ada.id, "base"))).toBe(12_375_000n);
  });

  it("refuses scenarios on other users' orders and on sandbox orders", async () => {
    const d = await createDeposit("2000000");
    const tunde = await makeVerifiedUser("tunde_tier1");
    const tundeToken = await sessionFor(tunde);
    const foreign = await postScenario(tundeToken, { order_id: d.id, scenario: "deposit_paid" });
    expect(foreign.status).toBe(404);

    const sandboxOrder = await makeOrder({
      userId: ada.id,
      provider: "yellowcard",
      providerMode: "sandbox",
      status: "awaiting_transfer",
      providerRef: "yc-sandbox-1",
    });
    const sandbox = await postScenario(adaToken, {
      order_id: sandboxOrder.id,
      scenario: "deposit_paid",
    });
    expect(sandbox.status).toBe(409);
    expect(sandbox.json).toMatchObject({ code: "SCENARIO_UNAVAILABLE" });
  });

  it("rejects deposit_paid_amount without an amount", async () => {
    const d = await createDeposit("2000000");
    const res = await postScenario(adaToken, { order_id: d.id, scenario: "deposit_paid_amount" });
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects a scenario whose state does not fit the order", async () => {
    const d = await createDeposit("2000000");
    await postScenario(adaToken, { order_id: d.id, scenario: "deposit_paid" });
    await drainJobs();
    expect((await depositService.get(ada.id, d.id)).status).toBe("settled");
    const res = await postScenario(adaToken, { order_id: d.id, scenario: "payout_rejected" });
    expect(res.status).toBe(409);
    expect(res.json).toMatchObject({ code: "INVALID_SCENARIO_STATE" });
  });
});
