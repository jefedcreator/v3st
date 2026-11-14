import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { now } from "@/backend/clock";
import { executionService, registerOperationFinalizer, unpack } from "@/backend/services/execution";
import { onchainRegistry } from "@/backend/services/onchain/registry";
import { o1Replica } from "@/backend/services/onchain/providers/o1";
import "@/backend/services/onchain/providers";
import { settlementAssetKey, testnetService } from "@/backend/services/onchain/testnet";
import type { ExecutionQuote } from "@/backend/services/onchain/types";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { db } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { makeUserWithWallets } from "../helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";

useTestDatabase();

async function setup() {
  const handle = await testnet();
  const network = await ensureTestnetNetwork();
  const u = await makeUserWithWallets();
  const ref = await testnetWalletService.ensureExecutionAccount(u.id);
  const { stock, token } = await makeTestnetStock({ symbol: "O1ST" });
  await handle.seedO1Pool(token, 1_000_000_000_000n, 500_000n * 10n ** 18n);
  await handle.mintSettlement(ref.accountAddress, 10_000_000n);
  const context = await testnetService.defaultContext("o1", "replica-1.0.0", ref.custodyProfileId);
  const startBlock = await handle.blockNumber();
  return { handle, network, u, ref, stock, token, context, startBlock };
}

async function makeQuote(
  ctx: Awaited<ReturnType<typeof setup>>,
  raw = 10_000_000n,
  allowPartialFill = false,
): Promise<ExecutionQuote> {
  return o1Replica.quote({
    userId: ctx.u.id,
    walletId: ctx.ref.wallet.id,
    stockId: ctx.stock.id,
    side: "buy",
    input: { asset: settlementAssetKey(ctx.handle.manifest), raw },
    outputAsset: ctx.stock.assetKey!,
    slippageBps: 100,
    allowPartialFill,
    context: ctx.context,
  });
}

describe("o1 replica on the local testnet", () => {
  it("preparedIsNotFilled and localReceiptSettlesExactlyOnce: construction is not a fill; one receipt settles once", { timeout: 60_000 }, async () => {
    const ctx = await setup();
    let finalized = 0;
    registerOperationFinalizer("spot", async () => {
      finalized += 1;
    });
    const quote = await makeQuote(ctx);
    expect(quote.minOutput.raw).toBeGreaterThan(0n);
    const op = await executionService.createOperation({
      key: `o1-op-${randomUUID()}`,
      requestHash: "test",
      kind: "spot",
      userId: ctx.u.id,
      walletId: ctx.ref.wallet.id,
      custodyProfileId: ctx.ref.custodyProfileId,
      networkId: ctx.network.id,
      providerId: "o1",
      quoteId: null,
      authorizationId: null,
      fingerprint: "pending",
      quote,
      recipient: ctx.ref.accountAddress,
    });
    await executionService.prepare(op.id);
    expect((await ctx.handle.o1SwapEvents(ctx.startBlock)).length).toBe(0);

    await executionService.progress(op.id);
    await ctx.handle.mine(3);
    await executionService.progress(op.id);
    await ctx.handle.mine(3);
    await executionService.progress(op.id);

    const reloaded = await db.onchainOperation.findUniqueOrThrow({ where: { id: op.id } });
    expect(reloaded.status).toBe("finalized");
    const events = (await ctx.handle.o1SwapEvents()).filter(
      (e) => e.recipient.toLowerCase() === ctx.ref.accountAddress.toLowerCase(),
    );
    expect(events.length).toBe(1);
    expect(events[0]!.amountIn).toBe(10_000_000n);
    expect(events[0]!.fee).toBe(50_000n);
    expect(events[0]!.recipient.toLowerCase()).toBe(ctx.ref.accountAddress.toLowerCase());
    expect(finalized).toBe(1);
    const stockBalance = await ctx.handle.tokenBalance(ctx.token, ctx.ref.accountAddress);
    expect(stockBalance).toBe(events[0]!.amountOut);

    await ctx.handle.mine(3);
    await executionService.progress(op.id);
    expect(
      (await ctx.handle.o1SwapEvents()).filter(
        (e) => e.recipient.toLowerCase() === ctx.ref.accountAddress.toLowerCase(),
      ).length,
    ).toBe(1);
    expect(finalized).toBe(1);
  });

  it("rejectsExpiredAndForeignQuote", { timeout: 60_000 }, async () => {
    const ctx = await setup();
    const quote = await makeQuote(ctx);
    const expired: ExecutionQuote = { ...quote, expiresAt: new Date(now().getTime() - 1000) };
    await expect(o1Replica.prepare(expired, "op-x")).rejects.toThrow(/expired/i);
    const foreign: ExecutionQuote = {
      ...quote,
      context: { ...ctx.context, chainId: 8453, integrationKind: "verified_provider_testnet", mode: "sandbox" },
    };
    await expect(o1Replica.prepare(foreign, "op-x")).rejects.toThrow(/Foreign quote context/);
    expect(() =>
      onchainRegistry.spot("o1", { ...ctx.context, chainId: 8453 }),
    ).toThrow();
  });

  it("partial fill with consent pulls only the filled input; without consent it reverts", { timeout: 60_000 }, async () => {
    const ctx = await setup();
    registerOperationFinalizer("spot", async () => undefined);
    await ctx.handle.setO1PartialFillBps(5_000n);
    try {
      const makeOp = async (allowPartialFill: boolean) => {
        const quote = await makeQuote(ctx, 10_000_000n, allowPartialFill);
        return executionService.createOperation({
          key: `o1-op-${randomUUID()}`,
          requestHash: "test",
          kind: "spot",
          userId: ctx.u.id,
          walletId: ctx.ref.wallet.id,
          custodyProfileId: ctx.ref.custodyProfileId,
          networkId: ctx.network.id,
          providerId: "o1",
          quoteId: null,
          authorizationId: null,
          fingerprint: "pending",
          quote,
          recipient: ctx.ref.accountAddress,
        });
      };
      // Consenting quote: the router pulls only half the input, output is pro-rata.
      const op = await makeOp(true);
      await executionService.progress(op.id);
      await ctx.handle.mine(3);
      await executionService.progress(op.id);
      const events = (await ctx.handle.o1SwapEvents()).filter(
        (e) => e.recipient.toLowerCase() === ctx.ref.accountAddress.toLowerCase(),
      );
      expect(events.length).toBe(1);
      const filled = events[0]!;
      expect(filled.amountIn).toBe(5_000_000n);
      expect(filled.amountOut).toBeGreaterThan(0n);
      const reloaded = await db.onchainOperation.findUniqueOrThrow({ where: { id: op.id } });
      expect(reloaded.status).toBe("finalized");
      const actual = unpack(reloaded.actual) as { input?: { raw?: bigint }; output?: { raw?: bigint } };
      expect(actual.input?.raw).toBe(5_000_000n);
      expect(actual.output?.raw ?? 0n).toBe(filled.amountOut);
      // Only the filled input left the account.
      expect(await ctx.handle.settlementBalance(ctx.ref.accountAddress)).toBe(10_000_000n - 5_000_000n);

      // Non-consenting quote: a smaller input fill cannot finalize onchain.
      const op2 = await makeOp(false);
      await executionService.progress(op2.id);
      await ctx.handle.mine(3);
      await executionService.progress(op2.id);
      const reverted = await db.onchainOperation.findUniqueOrThrow({ where: { id: op2.id } });
      expect(reverted.status).toBe("reverted");
      expect(reverted.errorReason).toBe("MIN_OUTPUT_BREACH");
      expect(await ctx.handle.settlementBalance(ctx.ref.accountAddress)).toBe(5_000_000n);
    } finally {
      await ctx.handle.setO1PartialFillBps(10_000n);
    }
  });
});
