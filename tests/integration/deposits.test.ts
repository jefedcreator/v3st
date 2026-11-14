import { randomBytes, randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import type { User } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { controlsService } from "@/backend/services/controls";
import { depositService } from "@/backend/services/deposits";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { ProviderError } from "@/backend/services/ramp/errors";
import { register, rampRegistry, reset } from "@/backend/services/ramp";
import { simRamp } from "@/backend/services/simulator/ramp";
import { simVenue } from "@/backend/services/simulator/venue";
import { walletService } from "@/backend/services/wallets";
import { POST as depositsPOST } from "@/app/api/v1/deposits/route";
import { GET as depositGET } from "@/app/api/v1/deposits/[id]/route";

import { callRoute } from "../helpers/http";
import { useTestDatabase } from "../helpers/db";
import {
  creditTreasury,
  makeBankAccount,
  makeStock,
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
  await seedTreasury("base", 1_000_000_000n);
  ada = await makeVerifiedUser("ada_tier2");
  await makeBankAccount(ada.id);
  await walletService.ensureUserWallets(ada.id);
  adaToken = await sessionFor(ada);
});

function headers(token: string, key?: string) {
  return {
    cookie: `sara-session=${token}`,
    origin: "http://localhost:3000",
    ...(key ? { "idempotency-key": key } : {}),
  };
}

async function postDeposit(token: string, body: unknown, key: string) {
  return callRoute(depositsPOST, {
    method: "POST",
    url: "http://localhost:3000/api/v1/deposits",
    body: JSON.stringify(body),
    headers: headers(token, key),
  });
}

async function createDeposit(ngnAmount: string, extra?: { stock_id?: string }, key?: string) {
  const res = await postDeposit(adaToken, { ngn_amount: ngnAmount, ...extra }, key ?? randomUUID());
  expect([200, 201, 202]).toContain(res.status);
  return (res.json as { data: { id: string } }).data;
}

describe("deposits", () => {
  it("returns locked bank instructions for a N20,000 deposit", async () => {
    const res = await postDeposit(adaToken, { ngn_amount: "2000000" }, "key-0001");
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({
      data: {
        status: "awaiting_transfer",
        fee_ngn: "20000",
        usd_amount: "12375000",
        rate: { kobo: "4", micro_usd: "25", ngn_per_usd: "1600.00" },
        bank_details: { test_details_only: true },
      },
    });
  });

  it("returns the same order for a replayed key and 409 for a changed body", async () => {
    const first = await postDeposit(adaToken, { ngn_amount: "2000000" }, "key-replay");
    const replay = await postDeposit(adaToken, { ngn_amount: "2000000" }, "key-replay");
    expect(replay.status).toBe(200);
    expect((replay.json as { data: { id: string } }).data.id).toBe(
      (first.json as { data: { id: string } }).data.id,
    );
    const changed = await postDeposit(adaToken, { ngn_amount: "3000000" }, "key-replay");
    expect(changed.status).toBe(409);
    expect(changed.json).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("answers 202 and finishes the collection in the worker when the partner is slow", async () => {
    const base = rampRegistry.get("yellowcard");
    let calls = 0;
    register({
      ...base,
      createCollection: (input: Parameters<typeof base.createCollection>[0]) => {
        calls += 1;
        if (calls === 1) throw new ProviderError("transient", "TRANSIENT");
        return base.createCollection(input);
      },
    });
    try {
      const res = await postDeposit(adaToken, { ngn_amount: "2000000" }, "key-slow");
      expect(res.status).toBe(202);
      expect((res.json as { data: { status: string } }).data.status).toBe("created");
      await drainJobs();
      const d = (res.json as { data: { id: string } }).data;
      expect((await depositService.get(ada.id, d.id)).status).toBe("awaiting_transfer");
    } finally {
      reset();
      register(base);
    }
  });

  it("credits a matching payment once across webhook, poll and retries", async () => {
    const d = await createDeposit("2000000");
    await simRamp.markCollectionPaid("yellowcard", d.id, {
      ngnAmount: 2_000_000n,
      senderName: "ADAEZE OBI",
    });
    await Promise.all(
      [depositService.progress(d.id), depositService.progress(d.id), depositService.progress(d.id)].map(
        (p) => p.catch(() => undefined),
      ),
    );
    await drainJobs();
    expect(await db.ledgerJournal.count({ where: { key: `deposit:${d.id}:received` } })).toBe(1);
    expect(await db.chainTransfer.count({ where: { key: `fund:${d.id}` } })).toBe(1);
    expect((await depositService.get(ada.id, d.id)).status).toBe("settled");
    expect(await ledgerService.balance(acct.userCash(ada.id, "base"))).toBe(12_375_000n);
  });

  it("buys the chosen stock after funding, or settles as cash when the buy reverts", async () => {
    const s = await makeStock();
    const d = await createDeposit("2000000", { stock_id: s.id });
    await simRamp.markCollectionPaid("yellowcard", d.id, {
      ngnAmount: 2_000_000n,
      senderName: "ADAEZE OBI",
    });
    await drainJobs();
    const dto = await depositService.get(ada.id, d.id);
    expect(dto.status).toBe("settled");
    expect(dto.trade?.status).toBe("filled");
  });

  it("settles as cash when the stock buy reverts", async () => {
    const s = await makeStock({ symbol: "TSTC" });
    const d = await createDeposit("2000000", { stock_id: s.id });
    await simVenue.addFault("swap", `deposit-buy:${d.id}`);
    await simRamp.markCollectionPaid("yellowcard", d.id, {
      ngnAmount: 2_000_000n,
      senderName: "ADAEZE OBI",
    });
    await drainJobs();
    const dto = await depositService.get(ada.id, d.id);
    expect(dto.status).toBe("settled");
    expect(dto.trade?.status).toBe("failed");
    expect(await ledgerService.balance(acct.userCash(ada.id, "base"))).toBe(12_375_000n);
  });

  it("refunds a third-party payment without crediting", async () => {
    const d = await createDeposit("2000000");
    await simRamp.markCollectionPaid("yellowcard", d.id, {
      ngnAmount: 2_000_000n,
      senderName: "CHINEDU EZE",
    });
    await depositService.progress(d.id);
    let dto = await depositService.get(ada.id, d.id);
    expect(dto.status).toBe("awaiting_transfer");
    expect(dto.hold_reason).toBe("name_mismatch");
    setNow("2026-11-13T09:01:00Z");
    await drainJobs();
    dto = await depositService.get(ada.id, d.id);
    expect(dto.status).toBe("refunded");
    expect(await db.ledgerJournal.count({ where: { orderId: d.id } })).toBe(0);
  });

  it("credits an underpayment inside tolerance at the partner-reported value", async () => {
    const d = await createDeposit("2000000");
    await simRamp.markCollectionPaid("yellowcard", d.id, {
      ngnAmount: 1_990_000n,
      senderName: "ADAEZE OBI",
    });
    await depositService.progress(d.id);
    const dto = await depositService.get(ada.id, d.id);
    expect(dto.status).toBe("received");
    expect(dto.received_ngn_amount).toBe("1990000");
  });

  it("refunds a payment outside tolerance", async () => {
    const d = await createDeposit("2000000");
    await simRamp.markCollectionPaid("yellowcard", d.id, {
      ngnAmount: 1_900_000n,
      senderName: "ADAEZE OBI",
    });
    await depositService.progress(d.id);
    const dto = await depositService.get(ada.id, d.id);
    expect(dto.hold_reason).toBe("amount_mismatch");
    setNow("2026-11-13T09:01:00Z");
    await drainJobs();
    expect((await depositService.get(ada.id, d.id)).status).toBe("refunded");
  });

  it("expires an unpaid deposit yet still credits a late payment", async () => {
    const d = await createDeposit("2000000");
    setNow("2026-11-13T13:01:00Z");
    await drainJobs();
    expect((await depositService.get(ada.id, d.id)).status).toBe("expired");
    await simRamp.markCollectionPaid("yellowcard", d.id, {
      ngnAmount: 2_000_000n,
      senderName: "ADAEZE OBI",
    });
    await drainJobs();
    expect((await depositService.get(ada.id, d.id)).status).toBe("settled");
  });

  it("waits in received while the treasury is short, then funds after top-up", async () => {
    const d = await createDeposit("500000000");
    await simRamp.markCollectionPaid("yellowcard", d.id, {
      ngnAmount: 500_000_000n,
      senderName: "ADAEZE OBI",
    });
    await drainJobs();
    let dto = await depositService.get(ada.id, d.id);
    expect(dto.status).toBe("received");
    expect(dto.hold_reason).toBe("treasury_short");
    expect(
      await db.operationalAlert.count({
        where: { kind: "treasury.short", resolvedAt: null },
      }),
    ).toBe(1);
    await creditTreasury("base", 10_000_000_000n);
    await depositService.progress(d.id).catch(() => undefined);
    await drainJobs();
    dto = await depositService.get(ada.id, d.id);
    expect(dto.status).toBe("settled");
    expect(dto.hold_reason).toBeNull();
  });

  it("refuses new deposits while paused but keeps progressing open ones", async () => {
    const d = await createDeposit("2000000");
    await controlsService.set(db, {
      scope: "deposits",
      paused: true,
      reason: "test pause",
      actorId: null,
    });
    const res = await postDeposit(adaToken, { ngn_amount: "2000000" }, "key-paused");
    expect(res.status).toBe(503);
    expect(res.json).toMatchObject({ code: "DEPOSITS_PAUSED" });
    await simRamp.markCollectionPaid("yellowcard", d.id, {
      ngnAmount: 2_000_000n,
      senderName: "ADAEZE OBI",
    });
    await drainJobs();
    expect((await depositService.get(ada.id, d.id)).status).toBe("settled");
  });

  it("hides other users' deposits", async () => {
    const d = await createDeposit("2000000");
    const other = await makeVerifiedUser("tunde_tier1");
    const otherToken = await sessionFor(other);
    const res = await callRoute(depositGET, {
      method: "GET",
      url: `http://localhost:3000/api/v1/deposits/${d.id}`,
      headers: headers(otherToken),
      params: { id: d.id },
    });
    expect(res.status).toBe(404);
  });
});
