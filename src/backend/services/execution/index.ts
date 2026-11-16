import { encodeAbiParameters, type Address, type Hex, keccak256 } from "viem";

import { type OnchainOperation, type OperationKind, type Prisma } from "@/server/prisma";
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
  AssetDelta,
  ExecutionObservation,
  ExecutionPlan,
  ExecutionQuote,
  PreparedCall,
  StockProviderId,
  StrategyPlan,
  StrategyQuote,
} from "@/backend/services/onchain/types";
import { chainObject, chainTarget, publicClientOn, relayerOn, walletClientOn } from "@/backend/services/onchain/chains";
import { manifestFor, verifyManifest } from "@/backend/services/onchain/manifests";
import { rpcRequest } from "@/backend/services/onchain/testnet";
import { testnetWalletService } from "@/backend/services/wallets/testnet";
import { canonicalJson, sha256Hex } from "@/utils";
import { fromDbRaw, toDbRaw } from "@/utils/asset-units";
import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@/utils/exceptions";

import { accountOperationNonce, allocateSignerNonce } from "./nonce";
import { assertExecutionPlan, assertQuoteBinding, callHashOf, ExecutionPlanRejected, operationKeyBytes32 } from "./policy";
import {
  assertPartialFill,
  buildObservation,
  transactionDeltas,
  PartialFillViolation,
  fetchReceipt,
  observationState,
  requiredConfirmations,
  revertReasonOf,
  txExists,
} from "./receipts";

export type OperationFinalizer = (
  op: OnchainOperation,
  observation: ExecutionObservation,
  tx: Tx,
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

// The executing account comes from the operation's custody profile: a
// provider_managed profile (e.g. Bankr) uses its own managed account, anything
// else uses the wallet's application execution account.
export async function accountAddressFor(
  prisma: Pick<Tx, "custodyProfile" | "wallet">,
  op: OnchainOperation,
): Promise<Address> {
  const profile = await prisma.custodyProfile.findUnique({ where: { id: op.custodyProfileId } });
  if (profile?.kind === "provider_managed") {
    if (!profile.managedAddress) throw new NotFoundException("Managed account missing", "WALLET_NOT_READY");
    return profile.managedAddress as Address;
  }
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: op.walletId } });
  if (!wallet.executionAddress) throw new NotFoundException("Execution account missing", "WALLET_NOT_READY");
  return wallet.executionAddress as Address;
}

function operationChainId(quote: ExecutionQuote | StrategyQuote): number {
  const context = "context" in quote ? quote.context : quote.request.context;
  return context.chainId;
}

function planAssets(plan: ExecutionPlan | StrategyPlan): string[] {
  if ("expectedInput" in plan) {
    return [plan.expectedInput.asset, plan.minimumOutput.asset];
  }
  const assets = new Set<string>();
  for (const a of [...plan.maximumInputs, ...plan.minimumOutputs]) assets.add(a.asset);
  return [...assets];
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
        requiredConfirmations: requiredConfirmations(operationChainId(input.quote)),
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
    const context = ((quote as ExecutionQuote).context ?? (quote as StrategyQuote).request?.context);
    let plan: ExecutionPlan | StrategyPlan;
    if (op.kind === "spot") {
      const adapter = onchainRegistry.spot(op.providerId as StockProviderId, context);
      plan = await adapter.prepare(quote as ExecutionQuote, operationId);
    } else {
      const adapter = onchainRegistry.strategy(op.providerId as StockProviderId, context);
      plan = await adapter.prepare(quote as StrategyQuote, operationId);
    }
    assertQuoteBinding(plan, quote, op, String((op.expected as { recipient: string }).recipient));
    await assertExecutionPlan(plan);
    // The quote expiry is the latest permitted acceptance and broadcast bound; a
    // plan deadline that extends past it is rejected, never silently extended.
    if (plan.deadline.getTime() > quote.expiresAt.getTime()) {
      throw new ExecutionPlanRejected("Plan deadline extends past the quote expiry bound");
    }
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

  private async reserveSponsorBudget(tx: Tx, operationId: string, estWei: bigint, chainId: number): Promise<void> {
    // Sponsor budgets are scoped per network so a public testnet relayer has its own
    // daily cap, separate from the local node's.
    const caps = policy.onchain.sponsor.byChain[chainId] ?? {
      dailyCapWei: policy.onchain.sponsor.dailyCapWei,
      perOperationCapWei: policy.onchain.sponsor.perOperationCapWei,
    };
    const dailyScope = `relayer:${chainId}:${now().toISOString().slice(0, 10)}`;
    const scopes: [string, bigint][] = [
      [`operation:${operationId}`, caps.perOperationCapWei],
      [dailyScope, caps.dailyCapWei],
    ];
    // One advisory lock serializes all sponsor reservations, so concurrent
    // operations never race the upsert's create branch on the shared daily scope;
    // the per-row lock then serializes the spend check below.
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(72012::bigint)`);
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
    opNonce: bigint,
  ): Promise<{ approveTx: Hex; executeTx: Hex; approveHash: Hex; executeHash: Hex }> {
    const chainId = plan.context.chainId;
    const account = relayerOn(chainId);
    const walletClient = walletClientOn(chainId);
    const rpcUrl = chainTarget(chainId).rpcUrl;
    const opKey = operationKeyBytes32(op.id);
    const epoch = (await testnetWalletService.accountState(accountAddress, chainId)).epoch;
    const deadlineSeconds = BigInt(Math.floor(plan.deadline.getTime() / 1000));
    const calls = plan.calls.map((c: PreparedCall) => ({
      target: c.to,
      data: c.data,
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
    const gasPrice = BigInt(await rpcRequest<Hex>(rpcUrl, chainId, "eth_gasPrice"));
    const approveGas = await rpcRequest<Hex>(rpcUrl, chainId, "eth_estimateGas", [
      { from: account.address, to: accountAddress, data: approveCalldata },
    ]);
    const signedApprove = await walletClient.signTransaction({
      account,
      chain: chainObject(chainId),
      to: accountAddress,
      data: approveCalldata,
      nonce: signerNonce,
      gas: BigInt(approveGas) + 100_000n,
      gasPrice,
    });
    // executeBatch is only valid after the approval tx lands, so it cannot be
    // estimated up front; use a fixed generous budget (sponsor-paid test gas).
    const signedExecute = await walletClient.signTransaction({
      account,
      chain: chainObject(chainId),
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

    await this.assertDeployment(op);

    if (op.status === "prepared") {
      const plan = this.planOf(op);
      const quote = this.quoteOf(op);
      assertQuoteBinding(plan, quote, op, String((op.expected as { recipient: string }).recipient));
      await assertExecutionPlan(plan);
      const chainId = operationChainId(quote);
      const manifest = manifestFor(chainId);
      const client = publicClientOn(chainId);
      const nodeChainId = await client.getChainId();
      if (nodeChainId !== chainId || nodeChainId !== manifest.chainId) {
        throw new ServiceUnavailableException("Network unhealthy", "NETWORK_UNHEALTHY");
      }
      await withTx(async (tx) => {
        await lockRows(tx, "onchain_operations", [op.id]);
        const current = await tx.onchainOperation.findUniqueOrThrow({ where: { id: op.id } });
        if (current.status !== "prepared") return;
        if (current.authorizationId) {
          // Revalidate consent before signing; the epoch check rejects revoked work.
          await authorizationService.assertActive(tx, current.userId, current.authorizationId);
        }
        const gasPrice = BigInt(await rpcRequest<Hex>(chainTarget(chainId).rpcUrl, chainId, "eth_gasPrice"));
        const estWei = gasPrice * 4_000_000n + 1n;
        await this.reserveSponsorBudget(tx, op.id, estWei, chainId);
        const accountAddress = await accountAddressFor(tx, current);
        // Execution-account operation nonce and shared relayer transaction nonce are
        // distinct persisted resources under separate concurrency controls.
        const opNonce = await accountOperationNonce(accountAddress, chainId);
        const signerNonce = await allocateSignerNonce(tx, current.id, relayerOn(chainId).address, chainId);

        const signed = await this.signOperation(current, plan, signerNonce, accountAddress, opNonce);
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
        expected.sponsor = { reservedWei: estWei.toString(), dailyScope: `relayer:${chainId}:${now().toISOString().slice(0, 10)}`, settled: false };

        expected.approveTxHash = signed.approveHash;
        await tx.onchainOperation.update({
          where: { id: current.id },
          data: {
            status: "signed",
            nonce: Number(opNonce),
            relayerNonce: signerNonce,
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
    const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
    await this.assertDeployment(op);
    const payload = await db.signedPayload.findUnique({ where: { operationId } });
    if (!payload) throw new NotFoundException("No signed payload", "OPERATION_UNRESOLVED");
    const chainId = this.planOf(op).context.chainId;
    const client = publicClientOn(chainId);
    // Already accepted transactions always reconcile. Revocation or expiry can
    // stop new economic execution, but cannot erase a possible earlier effect.
    if (!(await txExists(payload.executeHash as Hex, chainId))) {
      const plan = this.planOf(op);
      await assertExecutionPlan(plan);
      if (op.authorizationId) await authorizationService.assertActive(db, op.userId, op.authorizationId);
    }
    const fault = await db.simFault.findUnique({
      where: { scope_key: { scope: "execution.broadcast", key: operationId } },
    });
    for (const [hash, serialized] of [
      [payload.approveHash, payload.approveTx],
      [payload.executeHash, payload.executeTx],
    ] as [string, Hex][]) {
      if (await txExists(hash as Hex, chainId)) continue;
      if (fault && !fault.consumedAt) {
        await db.simFault.update({
          where: { scope_key: { scope: "execution.broadcast", key: operationId } },
          data: { consumedAt: now() },
        });
        throw new RetryableError("BROADCAST_INTERRUPTED", 1_000);
      }
      const sentHash = await client.sendRawTransaction({ serializedTransaction: serialized });
      if (chainTarget(chainId).canMine) {
        // Wait for inclusion: anvil returns the hash before the block is visible to
        // reads, and an immediate observe would otherwise report a false "unknown".
        await client.waitForTransactionReceipt({ hash: sentHash });
      } else {
        // On a public testnet the relayer cannot mine; wait for the confirmations
        // required by this network instead of returning before inclusion.
        await client.waitForTransactionReceipt({ hash: sentHash, confirmations: chainTarget(chainId).confirmations });
      }
    }
    await db.onchainOperation.update({
      where: { id: operationId },
      data: { status: "broadcast" },
    });
  }

  async observe(operationId: string): Promise<ExecutionObservation> {
    const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
    await this.assertDeployment(op);
    const expected = (op.expected as { plan?: unknown; preBalances?: Record<string, string> }) ?? {};
    const plan = expected.plan ? (unpackInner(expected.plan) as ExecutionPlan | StrategyPlan) : null;
    const network = await db.onchainNetwork.findUniqueOrThrow({ where: { id: op.networkId } });
    const chainId = plan?.context.chainId ?? network.chainId;
    const txHash = op.txHash as Hex | null;
    const state = await observationState(txHash, op.requiredConfirmations, chainId);
    const receipt = txHash ? await fetchReceipt(txHash, chainId) : null;
    let actualInput: AssetAmount | null = null;
    let actualOutput: AssetAmount | null = null;
    let gasCostWei: bigint | null = null;
    let deltas: AssetDelta[] = [];
    if (plan && txHash) {
      const assets = planAssets(plan);
      const inputAsset = "expectedInput" in plan ? plan.expectedInput.asset : plan.maximumInputs[0]?.asset;
      const outputAsset = "minimumOutput" in plan ? plan.minimumOutput.asset : plan.minimumOutputs[0]?.asset;
      const accountAddress = await accountAddressFor(db, op);
      deltas = receipt ? await transactionDeltas(txHash, assets, accountAddress, chainId) : [];
      const obs = buildObservation({
        operationId,
        txHash,
        state,
        receipt,
        deltas,
        inputAsset: inputAsset ?? assets[0]!,
        outputAsset: outputAsset ?? assets[assets.length - 1]!,
      });
      // A strategy operation uses the persisted deltas vector; its single-asset
      // actualInput/actualOutput fields remain null.
      if (op.kind === "spot") {
        actualInput = obs.actualInput;
        actualOutput = obs.actualOutput;
      }
      gasCostWei = obs.gasCostWei;
      const approveHash = (op.expected as { approveTxHash?: Hex }).approveTxHash;
      if (gasCostWei !== null && approveHash) {
        const approval = await fetchReceipt(approveHash, chainId);
        if (approval) gasCostWei += approval.gasUsed * approval.effectiveGasPrice;
      }
    }
    const observation: ExecutionObservation = {
      operationId,
      state,
      txHash,
      blockHash: receipt?.blockHash ?? null,
      blockNumber: receipt?.blockNumber ?? null,
      actualInput,
      actualOutput,
      deltas,
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
        deltas: pack(deltas) as Prisma.InputJsonValue,
      },
    });
    if (["confirmed", "reverted", "unknown"].includes(state)) {
      const status = state === "confirmed" ? "confirmed" : state === "reverted" ? "reverted" : "unknown";
      if (op.status !== "finalized") {
        // A reverted inclusion is labelled with the decoded onchain reason (e.g.
        // MIN_OUTPUT_BREACH) so downstream holds carry the real cause.
        const errorReason =
          status === "reverted" && txHash ? ((await revertReasonOf(txHash, chainId)) ?? "EXECUTION_REVERTED") : undefined;
        await db.onchainOperation.update({
          where: { id: operationId },
          data: {
            status,
            errorReason,
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
      if (op.status === "finalized" || (op.expected as { settled?: boolean } | null)?.settled) return;
      const expected = (op.expected as { plan?: unknown }) ?? {};
      const plan = expected.plan ? (unpackInner(expected.plan) as ExecutionPlan | StrategyPlan) : null;
      const quote = this.quoteOf(op);
      if (observation.state === "confirmed" && plan) {
        if ("maximumInputs" in plan) {
          const spent = (asset: string): bigint => {
            const delta = observation.deltas.find((d) => d.asset === asset)?.signedRaw ?? 0n;
            return delta < 0n ? -delta : 0n;
          };
          const received = (asset: string): bigint => observation.deltas.find((d) => d.asset === asset)?.signedRaw ?? 0n;
          if (plan.maximumInputs.some((a) => spent(a.asset) > a.raw) || plan.minimumOutputs.some((a) => received(a.asset) < a.raw)) {
            await tx.onchainOperation.update({ where: { id: operationId }, data: { status: "needs_review", errorReason: "STRATEGY_DELTA_MISMATCH" } });
            return;
          }
        }
        const minimum = "minimumOutput" in plan ? plan.minimumOutput : plan.minimumOutputs[0];
        if (op.kind === "spot" && minimum) {
          // Accepted-quote partial-fill rules: without allowPartialFill a smaller
          // input fill cannot finalize successfully; with it, the minimum
          // output/input rate is preserved with conservative rounding. A violation
          // observed onchain is a reconciliation hold, never a successful credit.
          const eq = quote as ExecutionQuote;
          const spotPlan = plan as ExecutionPlan;
          const actualIn = observation.actualInput?.raw ?? 0n;
          const actualOut = observation.actualOutput?.raw ?? 0n;
          try {
            assertPartialFill(
              {
                input: spotPlan.expectedInput,
                minOutput: minimum,
                allowPartialFill: eq.allowPartialFill ?? false,
              },
              actualIn,
              actualOut,
            );
          } catch (error) {
            if (error instanceof PartialFillViolation) {
              await tx.onchainOperation.update({
                where: { id: operationId },
                data: { status: "needs_review", errorReason: "PARTIAL_FILL_VIOLATION" },
              });
              return;
            }
            throw error;
          }
        } else if (minimum && observation.actualOutput && observation.actualOutput.raw < minimum.raw) {
          await tx.onchainOperation.update({
            where: { id: operationId },
            data: { status: "reverted", errorReason: "MIN_OUTPUT_BREACH" },
          });
          return;
        }
        const actual = pack({
          input: observation.actualInput,
          output: observation.actualOutput,
          deltas: observation.deltas,
          gasCostWei: observation.gasCostWei,
        });
        await this.settleSponsor(tx, op, observation.gasCostWei);
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
        if (finalizer) await finalizer(reloaded, observation, tx);
        return;
      }
      if (observation.state === "reverted") {
        await this.settleSponsor(tx, op, observation.gasCostWei);
        const expectedState = (op.expected ?? {}) as Prisma.JsonObject;
        expectedState.settled = true;
        await tx.onchainOperation.update({
          where: { id: operationId },
          data: { status: "reverted", errorReason: op.errorReason ?? "EXECUTION_REVERTED", expected: expectedState },
        });
        const reloaded = await tx.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
        const finalizer = finalizers.get(op.kind) ?? finalizers.get("*");
        if (finalizer) await finalizer(reloaded, observation, tx);
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
    if (["broadcast", "confirmed", "unknown", "reverted"].includes(after.status)) {
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

  private async assertDeployment(op: OnchainOperation): Promise<void> {
    const network = await db.onchainNetwork.findUniqueOrThrow({ where: { id: op.networkId } });
    const chainId = network.chainId;
    const manifest = manifestFor(chainId);
    const verified = await verifyManifest(chainId);
    if (!verified.ok || network.deploymentId !== manifest.deploymentId || network.networkId !== manifest.networkId) {
      await db.onchainOperation.update({ where: { id: op.id }, data: { status: "needs_review", errorReason: "DEPLOYMENT_MISMATCH" } });
      throw new ServiceUnavailableException("Execution deployment requires reconciliation", "NETWORK_UNHEALTHY");
    }
  }

  private async settleSponsor(tx: Tx, op: OnchainOperation, gas: bigint | null): Promise<void> {
    const expected = (op.expected ?? {}) as Prisma.JsonObject;
    const sponsor = expected.sponsor as { reservedWei: string; dailyScope: string; settled: boolean } | undefined;
    if (!sponsor || sponsor.settled || gas === null) return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(72012::bigint)`;
    for (const scope of [`operation:${op.id}`, sponsor.dailyScope]) {
      const row = await tx.sponsorBudget.findUniqueOrThrow({ where: { scope } });
      const spent = fromDbRaw(row.spentWei) - BigInt(sponsor.reservedWei) + gas;
      if (spent < 0n || spent > fromDbRaw(row.capWei)) throw new ConflictException("Sponsor spend requires reconciliation", "OPERATION_UNRESOLVED");
      await tx.sponsorBudget.update({ where: { id: row.id }, data: { spentWei: toDbRaw(spent) } });
    }
    sponsor.settled = true;
    await tx.onchainOperation.update({ where: { id: op.id }, data: { expected } });
  }
}

export const executionService = new ExecutionService();

export { canonicalJson };
