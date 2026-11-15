import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { controlsService } from "@/backend/services/controls";
import { onchainChecks } from "@/backend/services/reconciliation/onchain";
import { reconciliationService } from "@/backend/services/reconciliation";
import { publicClientFor, rpcRequest } from "@/backend/services/onchain/testnet";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { useTestDatabase } from "../helpers/db";
import { ensureTestnetNetwork, testnet } from "../helpers/testnet";
import { fundCash, makeUserWithWallets } from "../helpers/factories";

useTestDatabase();

describe("onchain reconciliation", () => {
  it("unexplainedPositionDeltaPausesAffectedRail without editing journals", async () => {
    const handle = await testnet();
    await ensureTestnetNetwork();
    const user = await makeUserWithWallets();
    const ref = await testnetWalletService.ensureExecutionAccount(user.id);
    await fundCash(user.id, 1_000_000n, "testnet");
    await handle.mintSettlement(ref.accountAddress, 2_000_000n);
    await handle.mine(3);
    const before = await db.ledgerJournal.count();
    const checks = await onchainChecks();
    expect(checks.find((c) => c.check.includes(`cash:${ref.wallet.id}`))).toMatchObject({ status: "breach", delta: "1000000" });
    await reconciliationService.run(new Date());
    expect(await controlsService.isPaused("trading")).toBe(true);
    expect(await controlsService.isPaused("payouts")).toBe(true);
    expect(await db.ledgerJournal.count()).toBe(before);
  });

  it("unavailableReadIsNotBalanced and a code change cannot pass deployment checks", async () => {
    const handle = await testnet();
    await ensureTestnetNetwork();
    const snapshot = await handle.snapshot();
    try {
      await rpcRequest(handle.url, "anvil_setCode", [handle.settlement, "0x"]);
      const checks = await onchainChecks();
      expect(checks.some((c) => c.status === "unavailable" && c.observed === null)).toBe(true);
      expect(checks.some((c) => c.status === "ok")).toBe(false);
    } finally {
      await handle.revert(snapshot);
    }
    const code = await publicClientFor().getCode({ address: handle.settlement });
    expect(code!).not.toBe("0x");
  });
});
