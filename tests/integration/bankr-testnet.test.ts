import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { executionService, registerOperationFinalizer, unpack } from "@/backend/services/execution";
import { onchainRegistry } from "@/backend/services/onchain/registry";
import { bankrReplica, bankrReplicaGateway, normalizeBankrSwap } from "@/backend/services/onchain/providers/bankr";
import "@/backend/services/onchain/providers";
import { settlementAssetKey, testnetService } from "@/backend/services/onchain/testnet";
import type { ExecutionQuote } from "@/backend/services/onchain/types";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { db } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { makeUserWithWallets } from "../helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";

useTestDatabase();

async function setup(opts?: { disableTrading?: boolean }) {
  const handle = await testnet();
  const network = await ensureTestnetNetwork();
  const u = await makeUserWithWallets();
  const app = await testnetWalletService.ensureExecutionAccount(u.id);
  const prov = await bankrReplicaGateway.provision(u.id);
  const { stock, token, registryKey } = await makeTestnetStock({ symbol: "BNKR" });
  if (opts?.disableTrading) {
    await handle.setTradingFlags(registryKey, false, false, false);
    await db.stock.update({ where: { id: stock.id }, data: { paused: true } });
  }
  await handle.seedO1Pool(token, 1_000_000_000_000n, 500_000n * 10n ** 18n);
  const profile = await db.custodyProfile.findUniqueOrThrow({ where: { id: prov.custodyProfileId } });
  const managed = profile.managedAddress as `0x${string}`;
  await handle.mintSettlement(managed, 10_000_000n);
  await handle.mintSettlement(app.accountAddress, 5_000_000n);
  const context = await testnetService.defaultContext("bankr", "replica-1.0.0", prov.custodyProfileId);
  return { handle, network, u, app, prov, stock, token, registryKey, context, managed };
}

async function makeQuote(ctx: Awaited<ReturnType<typeof setup>>, raw = 10_000_000n): Promise<ExecutionQuote> {
  return bankrReplica.quote({
    userId: ctx.u.id,
    walletId: ctx.prov.walletId,
    stockId: ctx.stock.id,
    side: "buy",
    input: { asset: settlementAssetKey(ctx.handle.manifest), raw },
    outputAsset: ctx.stock.assetKey!,
    slippageBps: 100,
    context: ctx.context,
  });
}

async function makeOperation(ctx: Awaited<ReturnType<typeof setup>>, quote: ExecutionQuote, key = randomUUID()) {
  return executionService.createOperation({
    key,
    requestHash: "test",
    kind: "spot",
    userId: ctx.u.id,
    walletId: ctx.prov.walletId,
    custodyProfileId: ctx.prov.custodyProfileId,
    networkId: ctx.network.id,
    providerId: "bankr",
    quoteId: null,
    authorizationId: null,
    fingerprint: "pending",
    quote,
    recipient: ctx.managed,
  });
}

describe("bankr managed-wallet replica on the local testnet", () => {
  it("quoteDoesNotGrantStockEligibility", { timeout: 60_000 }, async () => {
    const ctx = await setup({ disableTrading: true });
    const quote = await makeQuote(ctx);
    expect(quote.minOutput.raw).toBeGreaterThan(0n);
    const stockRow = await db.stock.findUniqueOrThrow({ where: { id: ctx.stock.id } });
    expect(stockRow.paused).toBe(true);
    expect(await db.investmentAuthorization.count({ where: { userId: ctx.u.id } })).toBe(0);
    expect(await db.custodyProfile.count({ where: { walletId: ctx.prov.walletId } })).toBe(2);
    expect(bankrReplicaGateway.realProviderCalls).toEqual([]);
    expect(onchainRegistry.actualFactoryCalls).toBe(0);
  });

  it("privyProfileCannotUseBankrWallet", { timeout: 60_000 }, async () => {
    const ctx = await setup();
    const appProfile = await db.custodyProfile.findUniqueOrThrow({ where: { id: ctx.app.custodyProfileId } });
    expect(appProfile.kind).toBe("application_account");
    expect(appProfile.externalProfileId).toBeNull();
    const walletBefore = await db.wallet.findUniqueOrThrow({ where: { id: ctx.app.wallet.id } });
    const appContext = await testnetService.defaultContext("bankr", "replica-1.0.0", ctx.app.custodyProfileId);
    await expect(
      bankrReplica.quote({
        userId: ctx.u.id,
        walletId: ctx.app.wallet.id,
        stockId: ctx.stock.id,
        side: "buy",
        input: { asset: settlementAssetKey(ctx.handle.manifest), raw: 10_000_000n },
        outputAsset: ctx.stock.assetKey!,
        slippageBps: 100,
        context: appContext,
      }),
    ).rejects.toThrow(/provider_managed/);
    const quote = await makeQuote(ctx);
    const op = await executionService.createOperation({
      key: randomUUID(),
      requestHash: "test",
      kind: "spot",
      userId: ctx.u.id,
      walletId: ctx.app.wallet.id,
      custodyProfileId: ctx.app.custodyProfileId,
      networkId: ctx.network.id,
      providerId: "bankr",
      quoteId: null,
      authorizationId: null,
      fingerprint: "pending",
      quote,
      recipient: ctx.app.accountAddress,
    });
    await expect(bankrReplicaGateway.submit(op.id)).rejects.toThrow(/application-account/);
    const walletAfter = await db.wallet.findUniqueOrThrow({ where: { id: ctx.app.wallet.id } });
    expect(walletAfter.providerWalletId).toBe(walletBefore.providerWalletId);
    const managedProfile = await db.custodyProfile.findUniqueOrThrow({ where: { id: ctx.prov.custodyProfileId } });
    expect(managedProfile.externalProfileId).toMatch(/^bankr-server-key:0x[0-9a-f]{40}$/);
    expect(managedProfile.externalProfileId).not.toMatch(/0x[0-9a-f]{64}/);
    expect(bankrReplicaGateway.realProviderCalls).toEqual([]);
    expect(onchainRegistry.actualFactoryCalls).toBe(0);
  });

  it("http200RevertDoesNotSettle", { timeout: 60_000 }, async () => {
    const ctx = await setup();
    let confirmedFills = 0;
    registerOperationFinalizer("spot", async (_op, observation) => {
      if (observation.state === "confirmed") confirmedFills += 1;
    });
    const quote = await bankrReplica.quote({
      userId: ctx.u.id,
      walletId: ctx.prov.walletId,
      stockId: ctx.stock.id,
      side: "buy",
      input: { asset: settlementAssetKey(ctx.handle.manifest), raw: 10_000_000n },
      outputAsset: ctx.stock.assetKey!,
      slippageBps: 0,
      context: ctx.context,
    });
    // The pool degrades after quoting: the executed output falls below minOutput.
    await ctx.handle.setO1PartialFillBps(1n);
    try {
      const op = await makeOperation(ctx, quote);
      await bankrReplicaGateway.submit(op.id);
      await ctx.handle.mine(3);
      const envelope = await bankrReplicaGateway.swap(op.id);
      expect(envelope.httpStatus).toBe(200);
      expect(envelope.body.success).toBe(false);
      const normalized = normalizeBankrSwap(envelope);
      expect(normalized.settled).toBe(false);
      expect(normalized.reverted).toBe(true);
      const row = await db.onchainOperation.findUniqueOrThrow({ where: { id: op.id } });
      expect(row.status).toBe("reverted");
      expect(row.actual).toBeNull();
      expect(confirmedFills).toBe(0);
      expect(await ctx.handle.tokenBalance(ctx.token, ctx.managed)).toBe(0n);
      expect(await ctx.handle.settlementBalance(ctx.managed)).toBe(10_000_000n);
      expect(await ctx.handle.settlementBalance(ctx.app.accountAddress)).toBe(5_000_000n);
    } finally {
      await ctx.handle.setO1PartialFillBps(10_000n);
    }
    expect(bankrReplicaGateway.realProviderCalls).toEqual([]);
  });

  it("uuidReplayReturnsOriginalOperation", { timeout: 60_000 }, async () => {
    const ctx = await setup();
    let confirmedFills = 0;
    registerOperationFinalizer("spot", async (_op, observation) => {
      if (observation.state === "confirmed") confirmedFills += 1;
    });
    const quote = await makeQuote(ctx);
    const uuid = randomUUID();
    const op1 = await makeOperation(ctx, quote, uuid);
    const op2 = await executionService.createOperation({
      key: uuid,
      requestHash: "test",
      kind: "spot",
      userId: ctx.u.id,
      walletId: ctx.prov.walletId,
      custodyProfileId: ctx.prov.custodyProfileId,
      networkId: ctx.network.id,
      providerId: "bankr",
      quoteId: null,
      authorizationId: null,
      fingerprint: "pending",
      quote,
      recipient: ctx.managed,
    });
    expect(op2.id).toBe(op1.id);
    const r1 = await bankrReplicaGateway.submit(op1.id);
    await ctx.handle.mine(3);
    const r2 = await bankrReplicaGateway.submit(op1.id);
    expect(r2.txHash).toBe(r1.txHash);
    const envelope = await bankrReplicaGateway.swap(op1.id);
    expect(normalizeBankrSwap(envelope).settled).toBe(true);
    const events = (await ctx.handle.o1SwapEvents()).filter(
      (e) => e.recipient.toLowerCase() === ctx.managed.toLowerCase(),
    );
    expect(events.length).toBe(1);
    expect(await db.onchainOperation.count({ where: { key: uuid } })).toBe(1);
    const row = await db.onchainOperation.findUniqueOrThrow({ where: { id: op1.id } });
    expect(row.status).toBe("finalized");
    const actual = unpack(row.actual) as { output?: { raw?: bigint } };
    expect(actual.output?.raw).toBe(events[0]!.amountOut);
    expect(confirmedFills).toBe(1);
    expect(await ctx.handle.settlementBalance(ctx.app.accountAddress)).toBe(5_000_000n);
    expect(bankrReplicaGateway.realProviderCalls).toEqual([]);
    expect(onchainRegistry.actualFactoryCalls).toBe(0);
  });

  it("timeoutKeepsOriginalHash", { timeout: 60_000 }, async () => {
    const ctx = await setup();
    const quote = await makeQuote(ctx);
    const op = await makeOperation(ctx, quote);
    await db.simFault.create({ data: { scope: "bankr.gateway.submit", key: op.key } });
    await expect(bankrReplicaGateway.submit(op.id)).rejects.toThrow(/BANKR_GATEWAY_TIMEOUT/);
    let row = await db.onchainOperation.findUniqueOrThrow({ where: { id: op.id } });
    expect(row.txHash).toBeNull();
    const r1 = await bankrReplicaGateway.submit(op.id);
    await ctx.handle.mine(3);
    row = await db.onchainOperation.findUniqueOrThrow({ where: { id: op.id } });
    expect(row.txHash).toBe(r1.txHash);
    await db.simFault.update({
      where: { scope_key: { scope: "bankr.gateway.submit", key: op.key } },
      data: { consumedAt: null },
    });
    await expect(bankrReplicaGateway.submit(op.id)).rejects.toThrow(/BANKR_GATEWAY_TIMEOUT/);
    row = await db.onchainOperation.findUniqueOrThrow({ where: { id: op.id } });
    expect(row.txHash).toBe(r1.txHash);
    const observation = await bankrReplicaGateway.lookup(op.id);
    expect(observation.state).toBe("confirmed");
    const r2 = await bankrReplicaGateway.submit(op.id);
    expect(r2.txHash).toBe(r1.txHash);
    const events = (await ctx.handle.o1SwapEvents()).filter(
      (e) => e.recipient.toLowerCase() === ctx.managed.toLowerCase(),
    );
    expect(events.length).toBe(1);
    expect(await ctx.handle.settlementBalance(ctx.managed)).toBe(0n);
    expect(await ctx.handle.tokenBalance(ctx.token, ctx.managed)).toBe(events[0]!.amountOut);
    expect(bankrReplicaGateway.realProviderCalls).toEqual([]);
  });
});
