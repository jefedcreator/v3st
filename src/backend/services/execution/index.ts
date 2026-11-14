import { encodeAbiParameters, type Address, type Hex, keccak256 } from "viem";

import { type OnchainOperation, type OperationKind, Prisma } from "@/server/prisma";
import { db, lockRows, withTx, type Tx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { authorizationService } from "@/backend/services/authorizations";
import { jobService } from "@/backend/services/jobs";
import { RetryableError } from "@/backend/services/jobs/types";
import { executionAccountAbi } from "@/backend/services/onchain/abis";
import { onchainRegistry } from "@/backend/services/onchain/registry";
import type {
  AssetAmount,
  BetaContext,
  ExecutionObservation,
  ExecutionPlan,
  ExecutionQuote,
  PreparedCall,
  StockProviderId,
  StrategyPlan,
  StrategyQuote,
} from "@/backend/services/onchain/types";
import {
  publicClientFor,
  readManifest,
  relayerAccount,
  rpcRequest,
  testnetRpcUrl,
  walletClientFor,
} from "@/backend/services/onchain/testnet";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { canonicalJson, sha256Hex } from "@/utils";
import { fromDbRaw, toDbRaw } from "@/utils/asset-units";
import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@/utils/exceptions";

import { accountOperationNonce, allocateSignerNonce } from "./nonce";
import { assertExecutionPlan, callHashOf, operationKeyBytes32 } from "./policy";
import {
  buildObservation,
  captureBalances,
  deltaVector,
  fetchReceipt,
  observationState,
  txExists,
} from "./receipts";

export type OperationFinalizer = (
  op: OnchainOperation,
  observation: ExecutionObservation,
) => Promise<void>;

const finalizers = new Map<string, OperationFinalizer>();

export function registerOperationFinalizer(key: string, fn: OperationFinalizer): void {
  finalizers.set(key, fn);
}

export function pack(value: unknown): unknown {
  if (typeof value === "bigint") return { __bigint: value.toString() };
  if (value instanceof Date) return { __date: value.toISOString() };
  if (Array.isArray(value)) return value.map(pack);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = pack(v);
    return out;
  }
  return value;
}

export function unpack(value: unknown): never {
  return unpackInner(value) as never;
}

function unpackInner(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unpackInner);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.__bigint === "string") return BigInt(record.__bigint);
    if (typeof record.__date === "string") return new Date(record.__date);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) out[k] = unpackInner(v);
    return out;
  }
  return value;
}

export type CreateOperationInput = {
  key: string;
  requestHash: string;
  kind: OperationKind;
  userId: string;
  walletId: string;
  custodyProfileId: string;
  networkId: string;
  providerId: StockProviderId;
  quoteId: string | null;
  authorizationId: string | null;
  fingerprint: string;
  quote: ExecutionQuote | StrategyQuote;
  recipient: Address;
};

function planAssets(plan: ExecutionPlan | StrategyPlan): string[] {
  if ("expectedInput" in plan) {
    return [plan.expectedInput.asset, plan.minimumOutput.asset];
  }
  const assets = new Set<string>();
  for (const a of [...plan.maximumInputs, ...plan.minimumOutputs]) assets.add(a.asset);
  return [...assets];
}

function planUsageUsdc(plan: ExecutionPlan | StrategyPlan): bigint {
  if ("expectedInput" in plan) return plan.expectedInput.raw;
  let total = 0n;
  for (const a of plan.maximumInputs) {
    if (a.asset.includes("usdc") || a.asset.endsWith("settlement")) total += a.raw;
  }
  return total;
}

class ExecutionService {
  async createOperation(input: CreateOperationInput): Promise<OnchainOperation> {
    const existing = await db.onchainOperation.findUnique({ where: { key: input.key } });
    if (existing) {
      if (existing.requestHash !== input.requestHash) {
        throw new ConflictException("Operation key reused with a different payload", "IDEMPOTENCY_KEY_REUSED");
      }
      return existing;
    }
    return db.onchainOperation.create({
      data: {
        key: input.key,
        requestHash: input.requestHash,
        kind: input.kind,
        userId: input.userId,
        walletId: input.walletId,
        custodyProfileId: input.custodyProfileId,
        networkId: input.networkId,
        providerId: input.providerId,
        quoteId: input.quoteId,
        authorizationId: input.authorizationId,
        fingerprint: input.fingerprint,
        requiredConfirmations: policy.onchain.requiredConfirmations,
        expected: pack({
          quote: input.quote,
          recipient: input.recipient,
        }) as Prisma.InputJsonValue,
      },
    });
  }

  private planOf(op: OnchainOperation): ExecutionPlan | StrategyPlan {
    const expected = op.expected as { plan?: unknown } | null;
    if (!expected?.plan) throw new NotFoundException("Operation has no prepared plan", "OPERATION_UNRESOLVED");
    return unpackInner(expected.plan) as ExecutionPlan | StrategyPlan;
  }

  private quoteOf(op: OnchainOperation): ExecutionQuote | StrategyQuote {
    const expected = op.expected as { quote?: unknown } | null;
    if (!expected?.quote) throw new NotFoundException("Operation has no quote snapshot", "OPERATION_UNRESOLVED");
    return unpackInner(expected.quote) as ExecutionQuote | StrategyQuote;
  }

  async prepare(operationId: string): Promise<void> {
    const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
    if (["prepared", "signed", "broadcast", "confirmed", "finalized"].includes(op.status)) return;
    const quote = this.quoteOf(op);
    const context = (quote as ExecutionQuote).context as BetaContext;
    let plan: ExecutionPlan | StrategyPlan;
    if (op.kind === "spot") {
      const adapter = onchainRegistry.spot(op.providerId as StockProviderId, context);
      plan = await adapter.prepare(quote as ExecutionQuote, operationId);
    } else {
      const adapter = onchainRegistry.strategy(op.providerId as StockProviderId, context);
      plan = await adapter.prepare(quote as StrategyQuote, operationId);
    }
    await assertExecutionPlan(plan);
    await withTx(async (tx) => {
      await lockRows(tx, "onchain_operations", [op.id]);
      const current = await tx.onchainOperation.findUniqueOrThrow({ where: { id: op.id } });
      if (current.status !== "pending") return;
      for (let i = 0; i < plan.calls.length; i += 1) {
        const call = plan.calls[i]!;
        await tx.onchainStep.create({
          data: {
            operationId: op.id,
            index: i,
            to: call.to,
            callHash: callHashOf(call),
            status: "prepared",
          },
        });
      }
      const expected = (current.expected as Record<string, unknown>) ?? {};
      expected.plan = pack(plan);
      await tx.onchainOperation.update({
        where: { id: op.id },
        data: { status: "prepared", fingerprint: plan.fingerprint, expected: expected as Prisma.InputJsonValue },
      });
    });
  }

  private async reserveSponsorBudget(tx: Tx, operationId: string, estWei: bigint): Promise<void> {
    const scopes: [string, bigint][] = [
      [`operation:${operationId}`, policy.onchain.sponsor.perOperationCapWei],
      [`daily:${now().toISOString().slice(0, 10)}`, policy.onchain.sponsor.dailyCapWei],
    ];
    for (const [scope, defaultCap] of scopes) {
      const row = await tx.sponsorBudget.upsert({
        where: { scope },
        create: { scope, windowStart: now(), spentWei: toDbRaw(0n), capWei: toDbRaw(defaultCap) },
        update: {},
      });
      await lockRows(tx, "sponsor_budgets", [row.id]);
      const fresh = await tx.sponsorBudget.findUniqueOrThrow({ where: { id: row.id } });
      const spent = fromDbRaw(fresh.spentWei);
      const cap = fromDbRaw(fresh.capWei);
      if (spent + estWei > cap) {
        throw new ServiceUnavailableException("Sponsor budget exhausted", "SPONSOR_UNAVAILABLE");
      }
      await tx.sponsorBudget.update({
        where: { id: row.id },
        data: { spentWei: toDbRaw(spent + estWei) },
      });
    }
  }

  private async signOperation(
    op: OnchainOperation,
    plan: ExecutionPlan | StrategyPlan,
    signerNonce: number,
    accountAddress: Address,
  ): Promise<{ approveTx: Hex; executeTx: Hex; approveHash: Hex; executeHash: Hex }> {
    const account = relayerAccount();
    const walletClient = walletClientFor(account);
    const opKey = operationKeyBytes32(op.id);
    const opNonce = await accountOperationNonce(accountAddress);
    const epoch = (await testnetWalletService.accountState(accountAddress)).epoch;
    const deadlineSeconds = BigInt(Math.floor(plan.deadline.getTime() / 1000));
    const calls = plan.calls.map((c: PreparedCall) => ({
      target: c.to as Address,
      data: c.data as Hex,
      value: c.value,
    }));
    const callIds = calls.map((c) =>
      keccak256(
        encodeAbiParameters(
          [
            { type: "bytes32" },
            { type: "address" },
            { type: "bytes32" },
            { type: "uint256" },
          ],
          [opKey, c.target, keccak256(c.data), c.value],
        ),
      ),
    );
    const { encodeFunctionData } = await import("viem");
    const approveCalldata = encodeFunctionData({
      abi: executionAccountAbi,
      functionName: "approveCalls",
      args: [callIds],
    });
    const executeCalldata = encodeFunctionData({
      abi: executionAccountAbi,
      functionName: "executeBatch",
      args: [opKey, opNonce, deadlineSeconds, epoch, calls],
    });
    const gasPrice = BigInt(await rpcRequest<Hex>(testnetRpcUrl(), "eth_gasPrice"));
    const approveGas = await rpcRequest<Hex>(testnetRpcUrl(), "eth_estimateGas", [
      { from: account.address, to: accountAddress, data: approveCalldata },
    ]);
    const signedApprove = await walletClient.signTransaction({
      to: accountAddress,
      data: approveCalldata,
      nonce: signerNonce,
      gas: BigInt(approveGas) + 100_000n,
      gasPrice,
    });
    // executeBatch is only valid after the approval tx lands, so it cannot be
    // estimated up front; use a fixed generous budget (sponsor-paid test gas).
    const signedExecute = await walletClient.signTransaction({
      to: accountAddress,
      data: executeCalldata,
      nonce: signerNonce + 1,
      gas: 3_000_000n,
      gasPrice,
    });
    return {
      approveTx: signedApprove,
      executeTx: signedExecute,
      approveHash: keccak256(signedApprove),
      executeHash: keccak256(signedExecute),
    };
  }

  async submit(operationId: string): Promise<void> {
    const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
    if (op.status === "pending") {
      throw new ConflictException("Operation is not prepared", "OPERATION_UNRESOLVED");
    }
    if (["finalized", "reverted"].includes(op.status)) return;

    if (op.status === "prepared") {
      const plan = this.planOf(op);
      const quote = this.quoteOf(op);
      const context = (quote as ExecutionQuote).context as BetaContext;
      const manifest = readManifest();
      const client = publicClientFor();
      const chainId = await client.getChainId();
      if (chainId !== manifest.chainId) {
        throw new ServiceUnavailableException("Local testnet unhealthy", "NETWORK_UNHEALTHY");
      }
      void context;
      await withTx(async (tx) => {
        await lockRows(tx, "onchain_operations", [op.id]);
        const current = await tx.onchainOperation.findUniqueOrThrow({ where: { id: op.id } });
        if (current.status !== "prepared") return;
        if (current.authorizationId) {
          await authorizationService.check(tx, current.userId, current.authorizationId, {
            scope: current.kind === "spot" ? "investments" : "strategies",
            stockId: (quote as ExecutionQuote).stockId ?? null,
            amountUsdc: planUsageUsdc(plan),
          });
        }
        const gasPrice = BigInt(await rpcRequest<Hex>(testnetRpcUrl(), "eth_gasPrice"));
        const estWei = gasPrice * 1_500_000n + 1n;
        await this.reserveSponsorBudget(tx, op.id, estWei);
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: current.walletId } });
        const accountAddress = wallet.executionAddress as Address;
        if (!accountAddress) throw new NotFoundException("Execution account missing", "WALLET_NOT_READY");
        const signerNonce = await allocateSignerNonce(tx, current.id, relayerAccount().address);
        const pre = await captureBalances(planAssets(plan), accountAddress);
        const signed = await this.signOperation(current, plan, signerNonce, accountAddress);
        await tx.signedPayload.upsert({
          where: { operationId: current.id },
          create: {
            operationId: current.id,
            approveTx: signed.approveTx,
            executeTx: signed.executeTx,
            approveHash: signed.approveHash,
            executeHash: signed.executeHash,
          },
          update: {},
        });
        const expected = (current.expected as Record<string, unknown>) ?? {};
        expected.preBalances = pre;
        expected.approveTxHash = signed.approveHash;
        await tx.onchainOperation.update({
          where: { id: current.id },
          data: {
            status: "signed",
            nonce: signerNonce,
            signedPayloadHash: sha256Hex(signed.approveTx + signed.executeTx),
            txHash: signed.executeHash,
            expected: expected as Prisma.InputJsonValue,
          },
        });
      }, { timeoutMs: 30_000 });
    }
    await this.broadcast(operationId);
  }

  private async broadcast(operationId: string): Promise<void> {
    const payload = await db.signedPayload.findUnique({ where: { operationId } });
    if (!payload) throw new NotFoundException("No signed payload", "OPERATION_UNRESOLVED");
    const url = testnetRpcUrl();
    const client = publicClientFor();
    const fault = await db.simFault.findUnique({
      where: { scope_key: { scope: "execution.broadcast", key: operationId } },
    });
    for (const [hash, serialized] of [
      [payload.approveHash, payload.approveTx],
      [payload.executeHash, payload.executeTx],
    ] as [string, Hex][]) {
      if (await txExists(hash as Hex)) continue;
      if (fault && !fault.consumedAt) {
        await db.simFault.update({
          where: { scope_key: { scope: "execution.broadcast", key: operationId } },
          data: { consumedAt: now() },
        });
        throw new RetryableError("BROADCAST_INTERRUPTED", 1_000);
      }
      await client.sendRawTransaction({ serializedTransaction: serialized });
      void url;
    }
    await db.onchainOperation.update({
      where: { id: operationId },
      data: { status: "broadcast" },
    });
  }

  async observe(operationId: string): Promise<ExecutionObservation> {
    const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
    const expected = (op.expected as { plan?: unknown; preBalances?: Record<string, string> }) ?? {};
    const plan = expected.plan ? (unpackInner(expected.plan) as ExecutionPlan | StrategyPlan) : null;
    const txHash = op.txHash as Hex | null;
    const state = await observationState(txHash, op.requiredConfirmations);
    const receipt = txHash ? await fetchReceipt(txHash) : null;
    let actualInput: AssetAmount | null = null;
    let actualOutput: AssetAmount | null = null;
    let gasCostWei: bigint | null = null;
    if (plan && txHash) {
      const assets = planAssets(plan);
      const inputAsset = "expectedInput" in plan ? plan.expectedInput.asset : plan.maximumInputs[0]?.asset;
      const outputAsset = "minimumOutput" in plan ? plan.minimumOutput.asset : plan.minimumOutputs[0]?.asset;
      const wallet = await db.wallet.findUniqueOrThrow({ where: { id: op.walletId } });
      const accountAddress = wallet.executionAddress as Address;
      const post: Record<string, string> = {};
      for (const asset of assets) {
        post[asset] = (await captureBalances([asset], accountAddress))[asset]!;
      }
      const deltas = deltaVector(expected.preBalances ?? {}, post, accountAddress);
      const obs = buildObservation({
        operationId,
        txHash,
        state,
        receipt,
        deltas,
        inputAsset: inputAsset ?? assets[0]!,
        outputAsset: outputAsset ?? assets[assets.length - 1]!,
      });
      actualInput = obs.actualInput;
      actualOutput = obs.actualOutput;
      gasCostWei = obs.gasCostWei;
    }
    const observation: ExecutionObservation = {
      operationId,
      state,
      txHash,
      blockHash: receipt?.blockHash ?? null,
      blockNumber: receipt?.blockNumber ?? null,
      actualInput,
      actualOutput,
      gasCostWei,
    };
    await db.chainObservation.create({
      data: {
        operationId,
        txHash: txHash ?? null,
        blockHash: observation.blockHash,
        blockNumber: observation.blockNumber === null ? null : toDbRaw(observation.blockNumber),
        state: state,
        gasCostWei: gasCostWei === null ? null : toDbRaw(gasCostWei),
        actualInput: pack(actualInput) as Prisma.InputJsonValue,
        actualOutput: pack(actualOutput) as Prisma.InputJsonValue,
      },
    });
    if (["confirmed", "reverted", "unknown"].includes(state)) {
      const status = state === "confirmed" ? "confirmed" : state === "reverted" ? "reverted" : "unknown";
      if (op.status !== "finalized") {
        await db.onchainOperation.update({
          where: { id: operationId },
          data: {
            status,
            blockHash: observation.blockHash,
            blockNumber: observation.blockNumber === null ? null : toDbRaw(observation.blockNumber),
          },
        });
      }
    }
    return observation;
  }

  async finalize(operationId: string): Promise<void> {
    const observation = await this.observe(operationId);
    await withTx(async (tx) => {
      await lockRows(tx, "onchain_operations", [operationId]);
      const op = await tx.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
      if (op.status === "finalized" || op.status === "reverted") return;
      const expected = (op.expected as { plan?: unknown }) ?? {};
      const plan = expected.plan ? (unpackInner(expected.plan) as ExecutionPlan | StrategyPlan) : null;
      if (observation.state === "confirmed" && plan) {
        const minimum = "minimumOutput" in plan ? plan.minimumOutput : plan.minimumOutputs[0];
        if (minimum && observation.actualOutput && observation.actualOutput.raw < minimum.raw) {
          await tx.onchainOperation.update({
            where: { id: operationId },
            data: { status: "reverted", errorReason: "MIN_OUTPUT_BREACH" },
          });
          return;
        }
        const actual = pack({
          input: observation.actualInput,
          output: observation.actualOutput,
          gasCostWei: observation.gasCostWei,
        });
        await tx.onchainOperation.update({
          where: { id: operationId },
          data: {
            status: "finalized",
            actual: actual as Prisma.InputJsonValue,
            blockHash: observation.blockHash,
            blockNumber: observation.blockNumber === null ? null : toDbRaw(observation.blockNumber),
          },
        });
        const reloaded = await tx.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
        const finalizer = finalizers.get(op.kind) ?? finalizers.get("*");
        if (finalizer) await finalizer(reloaded, observation);
        return;
      }
      if (observation.state === "reverted") {
        await tx.onchainOperation.update({
          where: { id: operationId },
          data: { status: "reverted", errorReason: "EXECUTION_REVERTED" },
        });
        const reloaded = await tx.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
        const finalizer = finalizers.get(op.kind) ?? finalizers.get("*");
        if (finalizer) await finalizer(reloaded, observation);
        return;
      }
      await tx.onchainOperation.update({
        where: { id: operationId },
        data: {
          status: observation.state === "reorged" ? "unknown" : observation.state === "unknown" ? "needs_review" : op.status,
        },
      });
    }, { timeoutMs: 30_000 });
  }

  async progress(operationId: string): Promise<void> {
    const op = await db.onchainOperation.findUnique({ where: { id: operationId } });
    if (!op) throw new NotFoundException("Operation not found", "NOT_FOUND");
    if (op.status === "pending") await this.prepare(operationId);
    const current = await db.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
    if (current.status === "prepared" || current.status === "signed") {
      await this.submit(operationId);
    }
    const after = await db.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
    if (["broadcast", "confirmed", "unknown"].includes(after.status)) {
      const observation = await this.observe(operationId);
      if (observation.state === "pending") {
        await jobService.enqueue(db, {
          kind: "operation.progress",
          subjectId: operationId,
          runAt: new Date(now().getTime() + 2_000),
        });
        return;
      }
      await this.finalize(operationId);
      return;
    }
    if (after.status === "confirmed") {
      await this.finalize(operationId);
    }
  }
}

export const executionService = new ExecutionService();

export { canonicalJson };
