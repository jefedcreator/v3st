import { randomUUID } from "node:crypto";

import { encodeFunctionData, type Address, type Hex } from "viem";
import { beforeAll, describe, expect, it } from "vitest";

import { now } from "@/backend/clock";
import { authorizationService } from "@/backend/services/authorizations";
import { executionService, registerOperationFinalizer } from "@/backend/services/execution";
import { planFingerprint } from "@/backend/services/execution/policy";
import { settlementTokenAbi } from "@/backend/services/onchain/abis";
import { onchainRegistry } from "@/backend/services/onchain/registry";
import { chainDeadlineBounded, chainDeadlineFromNow, onchainExpiryMs, settlementAssetKey, testnetService, readManifest } from "@/backend/services/onchain/testnet";
import type {
  ExecutionPlan,
  ExecutionQuote,
  ProviderCapabilities,
  QuoteRequest,
  SpotAdapter,
} from "@/backend/services/onchain/types";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { db } from "@/server/db";
import { toDbRaw } from "@/utils/asset-units";

import { standingAuth } from "../helpers/authorizations";
import { useTestDatabase } from "../helpers/db";
import { makeUserWithWallets } from "../helpers/factories";
import { ensureTestnetNetwork, makeTestnetStock, testnet } from "../helpers/testnet";

useTestDatabase();

const capabilities: ProviderCapabilities = {
  id: "o1",
  kind: "local_testnet_replica",
  evidenceId: "evidence:o1",
  custody: "application_account",
  spot: true,
  liquidity: false,
  distributions: false,
  separateClaim: false,
  exactOutput: false,
};

const testSpotAdapter: SpotAdapter = {
  capabilities,
  async quote(input: QuoteRequest): Promise<ExecutionQuote> {
    return makeQuote(input);
  },
  async prepare(quote: ExecutionQuote, operationId: string): Promise<ExecutionPlan> {
    const manifest = readManifest();
    const settlement = manifest.contracts.TestSettlementToken!.address;
    const registry = manifest.contracts.TestStockRegistry!.address;
    const wallet = await db.wallet.findUniqueOrThrow({ where: { id: quote.walletId } });
    const accountAddress = wallet.executionAddress as Address;
    const recipient = manifest.relayerAddress;
    const deadline = await chainDeadlineBounded(quote.expiresAt.getTime());
    const calls = [
      {
        to: settlement,
        data: encodeFunctionData({
          abi: settlementTokenAbi,
          functionName: "transfer",
          args: [recipient, quote.input.raw],
        }),
        value: 0n,
      },
    ];
    const plan: ExecutionPlan = {
      operationId,
      quoteId: quote.id,
      walletId: quote.walletId,
      context: quote.context,
      calls,
      expectedInput: quote.input,
      minimumOutput: quote.minOutput,
      recipient,
      deadline,
      fingerprint: "",
    };
    plan.fingerprint = planFingerprint(plan);
    void accountAddress;
    return plan;
  },
};

async function makeQuote(input: QuoteRequest): Promise<ExecutionQuote> {
  return {
    id: `q-${randomUUID()}`,
    userId: input.userId,
    walletId: input.walletId,
    stockId: input.stockId,
    side: input.side,
    context: input.context,
    input: input.input,
    expectedOutput: { asset: input.outputAsset, raw: 0n },
    minOutput: { asset: input.outputAsset, raw: 0n },
    userFeeUsdc: 0n,
    sponsorCostWei: 0n,
    allowPartialFill: input.allowPartialFill ?? false,
    priceImpactBps: 0,
    expiresAt: new Date(await onchainExpiryMs(30)),
    sourceBlock: 0n,
    routeFingerprint: "test-fixture",
  };
}

beforeAll(() => {
  onchainRegistry.register("o1", { spot: () => testSpotAdapter });
});

async function setupUser() {
  const handle = await testnet();
  const network = await ensureTestnetNetwork();
  const u = await makeUserWithWallets();
  const ref = await testnetWalletService.ensureExecutionAccount(u.id);
  return { handle, network, u, ref };
}

async function makeOperation(
  ctx: Awaited<ReturnType<typeof setupUser>>,
  amount: bigint,
  authorizationId: string | null = null,
) {
  const handle = ctx.handle;
  const manifest = handle.manifest;
  const context = await testnetService.defaultContext("o1", "test-1.0.0", ctx.ref.custodyProfileId);
  const quote: ExecutionQuote = {
    id: `q-${randomUUID()}`,
    userId: ctx.u.id,
    walletId: ctx.ref.wallet.id,
    stockId: "test-stock",
    side: "buy",
    context,
    input: { asset: settlementAssetKey(manifest), raw: amount },
    expectedOutput: { asset: settlementAssetKey(manifest), raw: 0n },
    minOutput: { asset: settlementAssetKey(manifest), raw: 0n },
    userFeeUsdc: 0n,
    sponsorCostWei: 0n,
    allowPartialFill: false,
    priceImpactBps: 0,
    expiresAt: new Date(await onchainExpiryMs(30)),
    sourceBlock: await handle.blockNumber(),
    routeFingerprint: "test-fixture",
  };
  const op = await executionService.createOperation({
    key: `op-${randomUUID()}`,
    requestHash: "test",
    kind: "spot",
    userId: ctx.u.id,
    walletId: ctx.ref.wallet.id,
    custodyProfileId: ctx.ref.custodyProfileId,
    networkId: ctx.network.id,
    providerId: "o1",
    quoteId: null,
    authorizationId,
    fingerprint: "pending",
    quote,
    recipient: manifest.relayerAddress,
  });
  await handle.mintSettlement(ctx.ref.accountAddress, amount);
  return { op, quote };
}

async function settle(handle: ReturnType<typeof testnet> extends Promise<infer T> ? T : never, opId: string) {
  await handle.mine(3);
  await executionService.progress(opId);
}

describe("testnet execution", () => {
  it("a changed deployment cannot broadcast a prepared operation", async () => {
    const ctx = await setupUser();
    const { op } = await makeOperation(ctx, 1_000_000n);
    await executionService.prepare(op.id);
    const snapshot = await ctx.handle.snapshot();
    try {
      const { rpcRequest } = await import("@/backend/services/onchain/testnet");
      await rpcRequest(ctx.handle.url, 31337, "anvil_setCode", [ctx.handle.settlement, "0x"]);
      await expect(executionService.submit(op.id)).rejects.toMatchObject({ code: "NETWORK_UNHEALTHY" });
      expect(await db.signedPayload.count({ where: { operationId: op.id } })).toBe(0);
      expect((await db.onchainOperation.findUniqueOrThrow({ where: { id: op.id } })).status).toBe("needs_review");
    } finally {
      await ctx.handle.revert(snapshot);
    }
  });

  it("broadcastCrashHasOneEffect: a crash after signing replays the same transaction, never a duplicate", { timeout: 60_000 }, async () => {
    const ctx = await setupUser();
    const { op } = await makeOperation(ctx, 5_000_000n);
    await db.simFault.create({
      data: { scope: "execution.broadcast", key: op.id },
    });
    await expect(executionService.progress(op.id)).rejects.toMatchObject({ code: "BROADCAST_INTERRUPTED" });
    const signed = await db.signedPayload.findUniqueOrThrow({ where: { operationId: op.id } });
    const hash = signed.executeHash as Hex;
    await ctx.handle.mine(3);
    await executionService.progress(op.id);
    await ctx.handle.mine(3);
    await executionService.progress(op.id);
    const reloaded = await db.onchainOperation.findUniqueOrThrow({ where: { id: op.id } });
    expect(reloaded.status).toBe("finalized");
    expect(reloaded.txHash).toBe(hash);
    const client = (await import("@/backend/services/onchain/testnet")).publicClientFor();
    const logs = await client.getLogs({
      address: ctx.ref.accountAddress,
      event: (await import("@/backend/services/onchain/abis")).executionAccountAbi.find(
        (item) => (item as { name?: string }).name === "OperationExecuted",
      ) as never,
      fromBlock: 0n,
    });
    expect(logs.length).toBe(1);
  });

  it("rejectsChangedRecipientAndUnlimitedApproval: decoded calldata must match the persisted plan", { timeout: 60_000 }, async () => {
    const ctx = await setupUser();
    const manifest = ctx.handle.manifest;
    const settlement = manifest.contracts.TestSettlementToken!.address;
    const registry = manifest.contracts.TestStockRegistry!.address;
    const context = await testnetService.defaultContext("o1", "test-1.0.0", ctx.ref.custodyProfileId);
    const base = {
      operationId: "op-x",
      quoteId: "q-x",
      walletId: ctx.ref.wallet.id,
      context,
      expectedInput: { asset: settlementAssetKey(manifest), raw: 100n },
      minimumOutput: { asset: settlementAssetKey(manifest), raw: 0n },
      recipient: manifest.relayerAddress,
      deadline: await chainDeadlineFromNow(),
      fingerprint: "",
    };
    const wrongRecipient: ExecutionPlan = {
      ...base,
      calls: [
        {
          to: settlement,
          data: encodeFunctionData({
            abi: settlementTokenAbi,
            functionName: "transfer",
            args: ["0x000000000000000000000000000000000000dEaD", 100n],
          }),
          value: 0n,
        },
      ],
    };
    wrongRecipient.fingerprint = planFingerprint(wrongRecipient);
    await expect(
      (await import("@/backend/services/execution/policy")).assertExecutionPlan(wrongRecipient),
    ).rejects.toThrow(/recipient/);
    const unlimited: ExecutionPlan = {
      ...base,
      calls: [
        {
          to: settlement,
          data: encodeFunctionData({
            abi: settlementTokenAbi,
            functionName: "approve",
            args: [registry, 2n ** 256n - 1n],
          }),
          value: 0n,
        },
      ],
    };
    unlimited.fingerprint = planFingerprint(unlimited);
    await expect(
      (await import("@/backend/services/execution/policy")).assertExecutionPlan(unlimited),
    ).rejects.toThrow(/Unlimited approvals/);
  });

  it("revocationStopsUnsubmittedWork: a revoked authorization blocks signing", { timeout: 60_000 }, async () => {
    const ctx = await setupUser();
    const { stock } = await makeTestnetStock({ symbol: "REV" });
    const auth = await standingAuth(ctx.u.id, { stockIds: [stock.id] }, ["claim"]);
    const { op } = await makeOperation(ctx, 1_000_000n, auth.id);
    await executionService.prepare(op.id);
    await authorizationService.revoke(ctx.u.id, auth.id);
    await expect(executionService.submit(op.id)).rejects.toMatchObject({
      code: "AUTHORIZATION_REVOKED",
    });
    const reloaded = await db.onchainOperation.findUniqueOrThrow({ where: { id: op.id } });
    expect(reloaded.status).toBe("prepared");
    expect(await db.signedPayload.count({ where: { operationId: op.id } })).toBe(0);
  });

  it("sponsorShortageNeverDebitsUserGas: sponsor exhaustion is a resumable 503 and user native balance is unchanged", { timeout: 60_000 }, async () => {
    const ctx = await setupUser();
    const { op } = await makeOperation(ctx, 1_000_000n);
    await executionService.prepare(op.id);
    await db.sponsorBudget.upsert({
      where: { scope: `operation:${op.id}` },
      create: {
        scope: `operation:${op.id}`,
        windowStart: now(),
        spentWei: toDbRaw(0n),
        capWei: toDbRaw(0n),
      },
      update: { spentWei: toDbRaw(0n), capWei: toDbRaw(0n) },
    });
    const { rpcRequest, testnetRpcUrl } = await import("@/backend/services/onchain/testnet");
    const before = BigInt(
      await rpcRequest<Hex>(testnetRpcUrl(), "eth_getBalance", [ctx.ref.accountAddress, "latest"]),
    );
    await expect(executionService.submit(op.id)).rejects.toMatchObject({
      code: "SPONSOR_UNAVAILABLE",
    });
    const after = BigInt(
      await rpcRequest<Hex>(testnetRpcUrl(), "eth_getBalance", [ctx.ref.accountAddress, "latest"]),
    );
    expect(before).toBe(after);
    const reloaded = await db.onchainOperation.findUniqueOrThrow({ where: { id: op.id } });
    expect(reloaded.status).toBe("prepared");
    expect(await db.signedPayload.count({ where: { operationId: op.id } })).toBe(0);
  });

  it("sharedRelayerAllocatesUniqueNonces: concurrent operations from two accounts on one relayer get distinct nonces", { timeout: 60_000 }, async () => {
    const ctxA = await setupUser();
    const ctxB = await setupUser();
    const a = await makeOperation(ctxA, 1_000_000n);
    const b = await makeOperation(ctxB, 1_000_000n);
    await executionService.prepare(a.op.id);
    await executionService.prepare(b.op.id);
    await Promise.all([executionService.submit(a.op.id), executionService.submit(b.op.id)]);
    const opA = await db.onchainOperation.findUniqueOrThrow({ where: { id: a.op.id } });
    const opB = await db.onchainOperation.findUniqueOrThrow({ where: { id: b.op.id } });
    expect(["signed", "broadcast"]).toContain(opA.status);
    expect(["signed", "broadcast"]).toContain(opB.status);
    // One shared relayer, two distinct persisted transaction nonces...
    expect(opA.relayerNonce).not.toBeNull();
    expect(opB.relayerNonce).not.toBeNull();
    expect(opA.relayerNonce).not.toBe(opB.relayerNonce);
    // ...while each execution account keeps its own operation nonce sequence.
    expect(opA.nonce).toBe(1);
    expect(opB.nonce).toBe(1);
    const payloadA = await db.signedPayload.findUniqueOrThrow({ where: { operationId: a.op.id } });
    const payloadB = await db.signedPayload.findUniqueOrThrow({ where: { operationId: b.op.id } });
    expect(payloadA.executeTx).not.toBe(payloadB.executeTx);
    await ctxA.handle.mine(3);
    await executionService.progress(a.op.id);
    await executionService.progress(b.op.id);
    await ctxA.handle.mine(3);
    await executionService.progress(a.op.id);
    await executionService.progress(b.op.id);
    const finalA = await db.onchainOperation.findUniqueOrThrow({ where: { id: a.op.id } });
    const finalB = await db.onchainOperation.findUniqueOrThrow({ where: { id: b.op.id } });
    expect(finalA.status).toBe("finalized");
    expect(finalB.status).toBe("finalized");
    expect(finalA.txHash).not.toBe(finalB.txHash);
  });

  it("restartRetainsAccountOwner: the deployment keystore reloads the same account and holds on key loss", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { keystorePath, keystoreRelayerKey } = await import("@/backend/services/onchain/testnet");
    const { privateKeyToAccount } = await import("viem/accounts");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "v3st-keystore-"));
    try {
      const first = keystoreRelayerKey(dir);
      const owner = privateKeyToAccount(first).address;
      // A restart (fresh call, same deployment directory) reloads the same owner.
      const second = keystoreRelayerKey(dir);
      expect(second).toBe(first);
      expect(privateKeyToAccount(second).address).toBe(owner);
      // The keystore file is restricted to the owner.
      const stat = await fs.stat(keystorePath(dir));
      expect(stat.mode & 0o077).toBe(0);
      // Key loss with an existing deployment holds instead of silently
      // assigning a new account owner.
      await fs.writeFile(path.join(dir, "manifest.json"), "{}");
      await fs.unlink(keystorePath(dir));
      expect(() => keystoreRelayerKey(dir)).toThrow(/holding/i);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("reorgBeforeFinalityCreditsNothing: an unfinalized reorged operation retains holds and posts nothing", { timeout: 60_000 }, async () => {
    const ctx = await setupUser();
    const finalizedCalls: string[] = [];
    registerOperationFinalizer("spot", async (op) => {
      finalizedCalls.push(op.id);
    });
    const { op } = await makeOperation(ctx, 2_000_000n);
    const snapshot = await ctx.handle.snapshot();
    await executionService.progress(op.id);
    await ctx.handle.mine(1);
    await executionService.progress(op.id);
    let reloaded = await db.onchainOperation.findUniqueOrThrow({ where: { id: op.id } });
    expect(reloaded.status).not.toBe("finalized");
    await ctx.handle.revert(snapshot);
    await executionService.progress(op.id);
    reloaded = await db.onchainOperation.findUniqueOrThrow({ where: { id: op.id } });
    expect(["unknown", "needs_review", "broadcast", "signed"]).toContain(reloaded.status);
    expect(finalizedCalls).toEqual([]);
    expect(await db.ledgerJournal.count()).toBe(0);
    expect(await db.chainObservation.count({ where: { operationId: op.id, state: { in: ["unknown", "reorged"] } } })).toBeGreaterThan(0);
  });
});
