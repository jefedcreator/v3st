import { describe, expect, it } from "vitest";

import { db, withTx } from "@/server/db";
import { policy } from "@/backend/config/policy";
import { jobService } from "@/backend/services/jobs";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { SIMULATED_DENYLIST } from "@/backend/services/screening";
import { walletService } from "@/backend/services/wallets";

import { useTestDatabase } from "../helpers/db";
import {
  createFundingTransfer,
  makeUser,
  makeUserWithWallets,
  seedTreasury,
} from "../helpers/factories";
import { drainJobs } from "../helpers/worker";

useTestDatabase();

describe("wallet provisioning", () => {
  it("provisions exactly one EVM and one Solana wallet under concurrent jobs", async () => {
    const u = await makeUser();
    await Promise.all([
      walletService.ensureUserWallets(u.id),
      walletService.ensureUserWallets(u.id),
    ]);
    const wallets = await db.wallet.findMany({ where: { userId: u.id } });
    expect(wallets.map((w) => w.family).sort()).toEqual(["evm", "solana"]);
    expect(wallets.find((w) => w.family === "evm")!.address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(wallets.find((w) => w.family === "solana")!.address).toMatch(
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    );
  });

  it("provisions wallets through the wallets.provision job handler", async () => {
    const u = await makeUser();
    await jobService.enqueue(db, { kind: "wallets.provision", subjectId: u.id });
    await drainJobs();
    expect(await db.wallet.count({ where: { userId: u.id } })).toBe(2);
  });
});

describe("treasury transfers", () => {
  it("reserves treasury funds when a treasury transfer is created", async () => {
    await seedTreasury("base", 10_000_000n);
    const u = await makeUserWithWallets();
    await withTx((tx) =>
      walletService.createTransfer(tx, {
        key: "fund:o1",
        purpose: "deposit_funding",
        chain: "base",
        amount: 4_000_000n,
        from: { kind: "treasury" },
        to: { kind: "user", userId: u.id },
      }),
    );
    expect(await ledgerService.balance(acct.treasury("base"))).toBe(6_000_000n);
    expect(await ledgerService.balance(acct.treasuryOutbound("base"))).toBe(4_000_000n);
  });

  it("refuses a treasury transfer above the treasury balance and writes nothing", async () => {
    await seedTreasury("base", 1_000_000n);
    const u = await makeUserWithWallets();
    await expect(
      withTx((tx) =>
        walletService.createTransfer(tx, {
          key: "fund:big",
          purpose: "deposit_funding",
          chain: "base",
          amount: 2_000_000n,
          from: { kind: "treasury" },
          to: { kind: "user", userId: u.id },
        }),
      ),
    ).rejects.toThrow(expect.objectContaining({ code: "INSUFFICIENT_FUNDS" }));
    expect(await db.chainTransfer.count()).toBe(0);
  });

  it("holds large treasury transfers for two distinct operators", async () => {
    await seedTreasury("base", 1_000_000_000_000n);
    await makeUserWithWallets();
    const op1 = await makeUser({ role: "operator" });
    const op2 = await makeUser({ role: "operator" });
    const amount = policy.treasury.quorumThresholdMicroUsdc;
    const t = await withTx((tx) =>
      walletService.createTransfer(tx, {
        key: "big:1",
        purpose: "float_topup",
        chain: "base",
        amount,
        from: { kind: "treasury" },
        to: { kind: "external", address: "0x2222222222222222222222222222222222222222" },
      }),
    );
    expect(t.status).toBe("awaiting_approval");
    expect((await walletService.approveTransfer(t.id, op1.id)).status).toBe(
      "awaiting_approval",
    );
    await expect(walletService.approveTransfer(t.id, op1.id)).rejects.toThrow(
      expect.objectContaining({ code: "ALREADY_APPROVED" }),
    );
    expect((await walletService.approveTransfer(t.id, op2.id)).status).toBe("pending");
  });
});

describe("transfer policy and screening", () => {
  it("blocks unlisted recipients and screened addresses before any submission", async () => {
    const u = await makeUserWithWallets();
    await withTx((tx) =>
      walletService.createTransfer(tx, {
        key: "ext:1",
        purpose: "payout_collection",
        chain: "base",
        amount: 1_000_000n,
        from: { kind: "user", userId: u.id },
        to: { kind: "external", address: "0x1111111111111111111111111111111111111111" },
      }),
    );
    const t1 = await db.chainTransfer.findUniqueOrThrow({ where: { key: "ext:1" } });
    await walletService.progressTransfer(t1.id);
    const failed1 = await db.chainTransfer.findUniqueOrThrow({ where: { key: "ext:1" } });
    expect(failed1.status).toBe("failed");
    expect(failed1.failureReason).toBe("POLICY");

    await withTx((tx) =>
      walletService.createTransfer(tx, {
        key: "ext:2",
        purpose: "payout_collection",
        chain: "base",
        amount: 1_000_000n,
        from: { kind: "user", userId: u.id },
        to: { kind: "external", address: SIMULATED_DENYLIST[0]! },
      }),
    );
    const t2 = await db.chainTransfer.findUniqueOrThrow({ where: { key: "ext:2" } });
    await walletService.progressTransfer(t2.id);
    const failed2 = await db.chainTransfer.findUniqueOrThrow({ where: { key: "ext:2" } });
    expect(failed2.status).toBe("failed");
    expect(failed2.failureReason).toBe("SCREENING_DENIED");
    expect(await db.simChainTx.count()).toBe(0);
  });

  it("lets a user fund only the chain treasury", async () => {
    const u = await makeUserWithWallets();
    const t = await withTx((tx) =>
      walletService.createTransfer(tx, {
        key: "user:treasury",
        purpose: "payout_collection",
        chain: "base",
        amount: 1_000_000n,
        from: { kind: "user", userId: u.id },
        to: { kind: "treasury" },
      }),
    );
    const progressed = await walletService.progressTransfer(t.id);
    expect(progressed.status).toBe("submitted");
    expect(await db.simChainTx.count({ where: { key: t.key } })).toBe(1);
  });

  it("releases the treasury reservation when a transfer fails policy", async () => {
    await createFundingTransfer({ key: "fund:ok" });
    await seedTreasury("solana", 5_000_000n);
    const before = await ledgerService.balance(acct.treasury("solana"));
    const t = await withTx((tx) =>
      walletService.createTransfer(tx, {
        key: "treasury:bad",
        purpose: "payout_collection",
        chain: "solana",
        amount: 1_000_000n,
        from: { kind: "treasury" },
        to: { kind: "external", address: "0x3333333333333333333333333333333333333333" },
      }),
    );
    expect(await ledgerService.balance(acct.treasuryOutbound("solana"))).toBe(1_000_000n);
    await walletService.progressTransfer(t.id);
    const failed = await db.chainTransfer.findUniqueOrThrow({ where: { id: t.id } });
    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toBe("POLICY");
    expect(await ledgerService.balance(acct.treasury("solana"))).toBe(before);
    expect(await ledgerService.balance(acct.treasuryOutbound("solana"))).toBe(0n);
  });
});
