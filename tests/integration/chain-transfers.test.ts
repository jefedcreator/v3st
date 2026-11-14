import { describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { simChain } from "@/backend/services/simulator/chain";
import { simulatedWalletProvider } from "@/backend/services/wallets/simulated";
import { walletService } from "@/backend/services/wallets";

import { fromDbRaw } from "@/utils/asset-units";

import { useTestDatabase } from "../helpers/db";
import { createFundingTransfer, makeUserWithWallets } from "../helpers/factories";
import { setNow } from "../helpers/time";

useTestDatabase();

async function treasuryRef(chain: string) {
  const w = await db.treasuryWallet.findUniqueOrThrow({ where: { chain } });
  return { providerWalletId: w.providerWalletId, address: w.address };
}

describe("chain transfer progression", () => {
  it("submits once when progress resumes after a crash after acceptance", async () => {
    const t = await createFundingTransfer();
    const ref = await treasuryRef("base");
    await simulatedWalletProvider.submitTransfer({
      key: t.key,
      chain: "base",
      from: ref,
      to: t.toAddress,
      token: "sim-usdc-base",
      amount: fromDbRaw(t.amount),
    });
    await walletService.progressTransfer(t.id);
    expect(await db.simChainTx.count({ where: { key: t.key } })).toBe(1);
    expect((await db.chainTransfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe(
      "submitted",
    );
  });

  it("confirms only after the simulated confirmation delay", async () => {
    const start = now();
    setNow(start.toISOString());
    const t = await createFundingTransfer();
    await walletService.progressTransfer(t.id);
    const row = await db.chainTransfer.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.status).toBe("submitted");

    setNow(new Date(start.getTime() + 3_000).toISOString());
    await walletService.progressTransfer(t.id);
    expect((await db.chainTransfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe(
      "submitted",
    );

    setNow(new Date(start.getTime() + 4_000).toISOString());
    await walletService.progressTransfer(t.id);
    expect((await db.chainTransfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe(
      "confirmed",
    );
  });

  it("fails the transfer when a chain fault exists for the key", async () => {
    const start = now();
    setNow(start.toISOString());
    const t = await createFundingTransfer();
    await simChain.addFault(t.key);
    await walletService.progressTransfer(t.id);
    const submitted = await db.chainTransfer.findUniqueOrThrow({ where: { id: t.id } });
    expect(submitted.status).toBe("submitted");
    await walletService.progressTransfer(t.id);
    const failed = await db.chainTransfer.findUniqueOrThrow({ where: { id: t.id } });
    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toBe("injected fault");
  });
});

describe("observeIncoming", () => {
  it("detects confirmed, pending and mismatched incoming transfers", async () => {
    const t = await createFundingTransfer();
    await walletService.progressTransfer(t.id);
    const row = await db.chainTransfer.findUniqueOrThrow({ where: { id: t.id } });
    const submittedAt = now();
    setNow(submittedAt.toISOString());

    expect(
      await walletService.observeIncoming("base", row.txHash!, {
        to: t.toAddress,
        amount: fromDbRaw(t.amount),
      }),
    ).toBe("pending");
    expect(
      await walletService.observeIncoming("base", row.txHash!, {
        to: t.toAddress,
        amount: fromDbRaw(t.amount) + 1n,
      }),
    ).toBe("mismatch");
    expect(await walletService.observeIncoming("base", "0xdeadbeef", { to: t.toAddress, amount: fromDbRaw(t.amount) })).toBe(
      "mismatch",
    );

    setNow(new Date(submittedAt.getTime() + 4_000).toISOString());
    expect(
      await walletService.observeIncoming("base", row.txHash!, {
        to: t.toAddress,
        amount: fromDbRaw(t.amount),
      }),
    ).toBe("confirmed");
  });
});

describe("simulated chain balances", () => {
  it("mints confirmed balances on the simulated chain", async () => {
    const u = await makeUserWithWallets();
    const w = await db.wallet.findUniqueOrThrow({
      where: { userId_family: { userId: u.id, family: "evm" } },
    });
    await simChain.mint("base", w.address, 5_000_000n, "mint:1");
    await simChain.mint("base", w.address, 5_000_000n, "mint:1");
    expect(await simulatedWalletProvider.balance("base", w.address, "sim-usdc-base")).toBe(
      5_000_000n,
    );
  });
});
