import { randomBytes, randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { controlsService } from "@/backend/services/controls";
import { customerFor } from "@/backend/services/compliance";
import { providerHealth } from "@/backend/services/ramp/health";
import { rampRegistry } from "@/backend/services/ramp";
import { simRamp } from "@/backend/services/simulator/ramp";
import { walletService } from "@/backend/services/wallets";
import { POST as depositsPOST } from "@/app/api/v1/deposits/route";

import { callRoute } from "../helpers/http";
import { useTestDatabase } from "../helpers/db";
import { makeBankAccount, makeVerifiedUser, seedTreasury } from "../helpers/factories";
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

async function createDeposit(ngnAmount: string) {
  const res = await callRoute(depositsPOST, {
    method: "POST",
    url: "http://localhost:3000/api/v1/deposits",
    body: JSON.stringify({ ngn_amount: ngnAmount }),
    headers: {
      cookie: `sara-session=${adaToken}`,
      origin: "http://localhost:3000",
      "idempotency-key": randomUUID(),
    },
  });
  expect([200, 201, 202]).toContain(res.status);
  return (res.json as { data: { id: string } }).data;
}

describe("provider failover", () => {
  it("sends new orders to Paycrest while the Yellow Card circuit is open and keeps open orders pinned", async () => {
    const first = await createDeposit("2000000");
    await drainJobs();
    let order = await db.rampOrder.findUniqueOrThrow({ where: { id: first.id } });
    expect(order.provider).toBe("yellowcard");
    expect(order.status).toBe("awaiting_transfer");

    await simRamp.addFault("ramp", "yellowcard");
    const yc = rampRegistry.get("yellowcard");
    const user = await db.user.findUniqueOrThrow({ where: { id: ada.id } });
    const quote = await yc.quote("in", 2_000_000n);
    for (let i = 0; i < 5; i += 1) {
      await expect(
        yc.createCollection({
          quote,
          customer: customerFor(user),
          source: {
            bankCode: "sim-bank-a",
            accountNumber: "0123456789",
            accountName: "ADAEZE OBI",
          },
          key: `probe-${i}`,
          recipient: null,
        }),
      ).rejects.toMatchObject({ kind: "transient", code: "PROVIDER_DOWN" });
    }
    expect(await providerHealth.isOpen("yellowcard", now())).toBe(true);

    const second = await createDeposit("2000000");
    order = await db.rampOrder.findUniqueOrThrow({ where: { id: second.id } });
    expect(order.provider).toBe("paycrest");

    const pinned = rampRegistry.forOrder({ provider: "yellowcard", providerMode: "simulated" });
    const spy = vi.spyOn(pinned, "getTransaction");
    await drainJobs();
    expect(spy).toHaveBeenCalled();
  });

  it("answers 503 when no provider is eligible", async () => {
    await controlsService.set(db, {
      scope: "provider:yellowcard",
      paused: true,
      reason: "test",
      actorId: null,
    });
    await controlsService.set(db, {
      scope: "provider:paycrest",
      paused: true,
      reason: "test",
      actorId: null,
    });
    const res = await callRoute(depositsPOST, {
      method: "POST",
      url: "http://localhost:3000/api/v1/deposits",
      body: JSON.stringify({ ngn_amount: "2000000" }),
      headers: {
        cookie: `sara-session=${adaToken}`,
        origin: "http://localhost:3000",
        "idempotency-key": randomUUID(),
      },
    });
    expect(res.status).toBe(503);
    expect(res.json).toMatchObject({ code: "RAIL_UNAVAILABLE" });
  });
});
