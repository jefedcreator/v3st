import { fromDbRaw } from "@/utils/asset-units";
import { randomBytes, randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { controlsService } from "@/backend/services/controls";
import { depositService } from "@/backend/services/deposits";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { verifyPaycrestSignature } from "@/backend/services/ramp/paycrest/webhook";
import { simChain } from "@/backend/services/simulator/chain";
import { simRamp } from "@/backend/services/simulator/ramp";
import { walletService } from "@/backend/services/wallets";
import { assertTransferPolicy, PolicyViolation } from "@/backend/services/wallets/policy";
import { withdrawalService } from "@/backend/services/withdrawals";
import { POST as depositsPOST } from "@/app/api/v1/deposits/route";

import { callRoute } from "../helpers/http";
import { useTestDatabase } from "../helpers/db";
import {
  fundCash,
  makeBankAccount,
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
  await controlsService.set(db, {
    scope: "provider:yellowcard",
    paused: true,
    reason: "paycrest pinned for this suite",
    actorId: null,
  });
});

function headers(token: string, key?: string) {
  const result: Record<string, string> = {
    cookie: `sara-session=${token}`,
    origin: "http://localhost:3000",
  };
  if (key) {
    result["idempotency-key"] = key;
  }
  return result;
}

async function createDeposit(ngnAmount: string) {
  const res = await callRoute(depositsPOST, {
    method: "POST",
    url: "http://localhost:3000/api/v1/deposits",
    body: JSON.stringify({ ngn_amount: ngnAmount }),
    headers: headers(adaToken, randomUUID()),
  });
  expect([200, 201, 202]).toContain(res.status);
  return (res.json as { data: { id: string } }).data;
}

const PAYCREST_BUY_USD = (ngnKobo: bigint) => (ngnKobo * 1_000n) / 161n;

describe("paycrest direct settlement", () => {
  it("credits a Paycrest on-ramp from the verified chain transfer without treasury funding", async () => {
    const d = await createDeposit("2000000");
    const order = await db.rampOrder.findUniqueOrThrow({ where: { id: d.id } });
    expect(order.provider).toBe("paycrest");
    expect(order.settlementModel).toBe("direct_chain");
    expect(order.status).toBe("awaiting_transfer");
    await simRamp.markCollectionPaid("paycrest", d.id, {
      ngnAmount: 2_000_000n,
      senderName: "ADAEZE OBI",
    });
    await drainJobs();
    const dto = await depositService.get(ada.id, d.id);
    expect(dto.status).toBe("settled");
    expect(await db.chainTransfer.count({ where: { purpose: "deposit_funding" } })).toBe(0);
    expect(await db.ledgerJournal.count({ where: { key: `deposit:${d.id}:received` } })).toBe(1);
    expect(await ledgerService.balance(acct.userCash(ada.id, "base"))).toBe(
      PAYCREST_BUY_USD(2_000_000n),
    );
  });

  it("waits while the Paycrest settlement is still unconfirmed", async () => {
    const d = await createDeposit("2000000");
    await simRamp.markCollectionPaid("paycrest", d.id, {
      ngnAmount: 2_000_000n,
      senderName: "ADAEZE OBI",
    });
    await depositService.progress(d.id);
    const dto = await depositService.get(ada.id, d.id);
    expect(dto.status).toBe("awaiting_transfer");
    expect(await db.ledgerJournal.count({ where: { orderId: d.id } })).toBe(0);
  });

  it("does not credit a misdirected settlement", async () => {
    const d = await createDeposit("2000000");
    await simChain.submit("base", {
      key: `paycrest:settle:${d.id}`,
      from: "0xpaycrestsim",
      to: "0x00000000000000000000000000000000000bad",
      token: "USDC",
      amount: PAYCREST_BUY_USD(2_000_000n),
    });
    await simRamp.markCollectionPaid("paycrest", d.id, {
      ngnAmount: 2_000_000n,
      senderName: "ADAEZE OBI",
    });
    await drainJobs();
    const dto = await depositService.get(ada.id, d.id);
    expect(dto.status).toBe("awaiting_transfer");
    expect(dto.hold_reason).toBe("needs_review");
    expect(await db.ledgerJournal.count({ where: { orderId: d.id } })).toBe(0);
    expect(await db.operationalAlert.count({ where: { dedupeKey: `deposit.settlement_mismatch:${d.id}` } })).toBe(1);
  });

  it("funds exactly the bound receive address once for an off-ramp", async () => {
    await fundCash(ada.id, 10_000_000n);
    const q = await withdrawalService.quote(ada.id, { ngn_amount: 500_000n });
    const quoteRow = await db.withdrawalQuote.findUniqueOrThrow({ where: { id: q.id } });
    expect(quoteRow.provider).toBe("paycrest");
    const { withdrawal } = await withdrawalService.confirm(ada.id, q.id, "pc-fund-1");
    await drainJobs();
    const order = await db.rampOrder.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(order.provider).toBe("paycrest");
    expect(order.settlementModel).toBe("direct_chain");
    expect(order.fundingAddress).toBeTruthy();
    expect(order.fundingAmount).toBeGreaterThan(0n);
    const transfers = await db.chainTransfer.findMany({
      where: { purpose: "direct_payout_funding" },
    });
    expect(transfers).toHaveLength(1);
    expect(transfers[0]!.toAddress).toBe(order.fundingAddress);
    expect(fromDbRaw(transfers[0]!.amount)).toBe(order.fundingAmount);
    expect((await withdrawalService.get(ada.id, withdrawal.id)).status).toBe("paid");

    let err: unknown;
    try {
      assertTransferPolicy(
        {
          key: "probe",
          purpose: "direct_payout_funding",
          chain: "base",
          amount: order.fundingAmount!,
          from: { kind: "user", userId: ada.id },
          to: { kind: "external", address: "0x00000000000000000000000000000000000bad" },
          orderId: order.id,
        },
        {
          fromAddress: "0xfrom",
          toAddress: "0x00000000000000000000000000000000000bad",
          boundAddress: order.fundingAddress,
        },
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PolicyViolation);
    expect((err as PolicyViolation).code).toBe("POLICY");
  });

  it("returns a refunded off-ramp to the wallet without touching any float", async () => {
    const ada2 = await makeVerifiedUser("ada_tier2");
    await makeBankAccount(ada2.id, "0000000000");
    await walletService.ensureUserWallets(ada2.id);
    await fundCash(ada2.id, 10_000_000n);
    const q = await withdrawalService.quote(ada2.id, { ngn_amount: 500_000n });
    const { withdrawal } = await withdrawalService.confirm(ada2.id, q.id, "pc-refund-1");
    await drainJobs();
    const dto = await withdrawalService.get(ada2.id, withdrawal.id);
    expect(dto.status).toBe("reversed");
    expect(await ledgerService.balance(acct.userCash(ada2.id, "base"))).toBe(10_000_000n);
    expect(
      await db.ledgerJournal.count({
        where: { key: { startsWith: `payout:${withdrawal.id}:submitted` } },
      }),
    ).toBe(0);
    expect(await ledgerService.balance(acct.float("paycrest"))).toBe(0n);
    expect(
      await db.ledgerJournal.count({ where: { key: `payout:${withdrawal.id}:refunded` } }),
    ).toBe(1);
  });

  it("rejects an altered Paycrest webhook body", () => {
    const raw = '{"event":"payment_order.settled","data":{"id":"po_1","status":"settled"}}';
    const h = new Headers({
      "X-Paycrest-Signature": "cb53f5c60ca188b8ff1e57f1ce5f67e0b4774e45213b676ceb4f115dd312d329",
    });
    expect(verifyPaycrestSignature(h, Buffer.from(raw), "paycrest-test-secret")).toBe(true);
    expect(
      verifyPaycrestSignature(h, Buffer.from(raw.replace("po_1", "po_2")), "paycrest-test-secret"),
    ).toBe(false);
  });

  it("never makes a network request for Paycrest", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.reject(new Error("Live network access is disabled in tests")),
    );
    const prev = globalThis.fetch;
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const d = await createDeposit("2000000");
      await simRamp.markCollectionPaid("paycrest", d.id, {
        ngnAmount: 2_000_000n,
        senderName: "ADAEZE OBI",
      });
      await drainJobs();
      expect((await depositService.get(ada.id, d.id)).status).toBe("settled");
      await fundCash(ada.id, 10_000_000n);
      const q = await withdrawalService.quote(ada.id, { ngn_amount: 500_000n });
      const { withdrawal } = await withdrawalService.confirm(ada.id, q.id, "pc-net-1");
      await drainJobs();
      expect((await withdrawalService.get(ada.id, withdrawal.id)).status).toBe("paid");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal("fetch", prev);
    }
  });
});
