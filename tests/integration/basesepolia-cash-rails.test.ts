import { describe, expect, it } from "vitest";

import { depositService } from "@/backend/services/deposits";
import { withdrawalService } from "@/backend/services/withdrawals";
import { treasuryService } from "@/backend/services/treasury";
import { executionAccounts } from "@/backend/services/wallets/execution-accounts";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { kycService } from "@/backend/services/kyc";
import { scenarioService } from "@/backend/services/scenarios";
import { settlementAssetKeyOn } from "@/backend/services/onchain/manifests";
import { publicClientOn } from "@/backend/services/onchain/chains";
import { settlementTokenAbi } from "@/backend/services/onchain/abis";
import { db } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { makeBankAccount, makeUserWithWallets } from "../helpers/factories";
import { startSepoliaShapedNode } from "../helpers/sepolia-local";
import { makeTestnetStock } from "../helpers/testnet";
import { drainJobs } from "../helpers/worker";

useTestDatabase();

async function makeReadyCustomer() {
  const user = await makeUserWithWallets();
  await kycService.verify(user.id, { persona: "ada_tier2" });
  await makeBankAccount(user.id);
  return db.user.findUniqueOrThrow({ where: { id: user.id } });
}

async function fundViaDeposit(userId: string, key: string, ngnAmount: bigint) {
  const { deposit } = await depositService.create(userId, { ngn_amount: ngnAmount }, key, {
    chain: "basesepolia",
  });
  await scenarioService.run(userId, { order_id: deposit.id, scenario: "deposit_paid" });
  await drainJobs();
  return depositService.get(userId, deposit.id);
}

async function readTokenBalance(chainId: number, token: string, address: string): Promise<bigint> {
  const client = publicClientOn(chainId);
  return client.readContract({
    address: token as `0x${string}`,
    abi: settlementTokenAbi,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
  }) as Promise<bigint>;
}

describe("Base Sepolia cash rails", () => {
  it("funds a Base Sepolia account from a naira deposit", async () => {
    const node = await startSepoliaShapedNode();
    try {
      const user = await makeReadyCustomer();
      const account = await executionAccounts.ensure(user.id, 84532);
      await treasuryService.seedOpeningBalances({
        treasuryMicroUsdc: { basesepolia: 10_000_000_000n },
        floatMicroUsd: 10_000_000_000n,
      });
      const settled = await fundViaDeposit(user.id, "dep-bs-1", 2_000_000n);
      expect(settled.status).toBe("settled");
      const usd = BigInt(settled.usd_amount!);
      expect(usd).toBeGreaterThan(0n);
      expect(await ledgerService.balance(acct.userCash(user.id, "basesepolia"))).toBe(usd);
      expect(await readTokenBalance(84532, node.settlement, account.accountAddress)).toBe(usd);
    } finally {
      await node.stop();
    }
  });

  it("collects a withdrawal from the Base Sepolia account", async () => {
    const node = await startSepoliaShapedNode();
    try {
      const user = await makeReadyCustomer();
      const account = await executionAccounts.ensure(user.id, 84532);
      await treasuryService.seedOpeningBalances({
        treasuryMicroUsdc: { basesepolia: 10_000_000_000n },
        floatMicroUsd: 10_000_000_000n,
      });
      await fundViaDeposit(user.id, "dep-bs-2", 2_000_000n);
      const before = await readTokenBalance(84532, node.settlement, account.accountAddress);

      const quote = await withdrawalService.quote(user.id, { ngn_amount: 500_000n }, { chain: "basesepolia" });
      const { withdrawal } = await withdrawalService.confirm(user.id, quote.id, "wd-bs-1");
      const orderRow = await db.rampOrder.findUniqueOrThrow({ where: { id: withdrawal.id } });
      expect(orderRow.chain).toBe("basesepolia");
      await drainJobs();
      const paid = await withdrawalService.get(user.id, withdrawal.id);
      expect(paid.status).toBe("paid");
      const after = await readTokenBalance(84532, node.settlement, account.accountAddress);
      expect(before - after).toBe(BigInt(paid.debit_usdc));
    } finally {
      await node.stop();
    }
  });

  it("rejects stock_id on legacy deposits for onchain stocks", async () => {
    const { stock } = await makeTestnetStock({ symbol: "TONX", referencePriceMicroUsd: 250_000_000n });
    const user = await makeReadyCustomer();
    await expect(
      depositService.create(user.id, { ngn_amount: 2_000_000n, stock_id: stock.id }, "dep-bs-3"),
    ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
  });

  it("never sends a Base Sepolia call to the local node", async () => {
    const node = await startSepoliaShapedNode();
    try {
      const user = await makeReadyCustomer();
      await executionAccounts.ensure(user.id, 84532);
      await treasuryService.seedOpeningBalances({
        treasuryMicroUsdc: { basesepolia: 10_000_000_000n },
        floatMicroUsd: 10_000_000_000n,
      });
      await fundViaDeposit(user.id, "dep-bs-4", 2_000_000n);
      const sepoliaCalls = node.calls.filter((call) => call.chainId === 84532);
      expect(sepoliaCalls.length).toBeGreaterThan(0);
      for (const call of sepoliaCalls) {
        expect(call.url).toBe("https://sepolia.v3st.test");
        expect(call.url).not.toBe(process.env.TESTNET_RPC_URL);
      }
      expect(settlementAssetKeyOn(84532)).toMatch(/^basesepolia:84532:0x[0-9a-f]{40}$/);
    } finally {
      await node.stop();
    }
  });
});
