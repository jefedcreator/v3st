import { type Address, type Hex, type Log, parseEventLogs } from "viem";

import { type Prisma, type RewardSource } from "@/server/prisma";
import { db, withTx, type Tx } from "@/server/db";
import { accountAddressFor, unpack } from "@/backend/services/execution";
import { investmentService } from "@/backend/services/investments";
import { jobService } from "@/backend/services/jobs";
import { lagosWeek } from "@/backend/services/jobs/schedule";
import { now } from "@/backend/clock";
import { hookFeeAbi, hydrexPoolAbi, hydropumpLockerAbi, stockDistributionAbi } from "@/backend/services/onchain/abis";
import { publicClientFor, readManifest, settlementAssetKey } from "@/backend/services/onchain/testnet";
import type { StrategyQuote } from "@/backend/services/onchain/types";
import { assetKey } from "@/backend/services/onchain/types";
import { ledgerService } from "@/backend/services/ledger";
import { rewardReceived } from "@/backend/services/ledger/postings";
import { fromDbRaw, toDbRaw } from "@/utils/asset-units";
import { ConflictException, NotFoundException, UnprocessableEntityException } from "@/utils/exceptions";

export type RewardReceiptDto = {
  id: string;
  source: string;
  source_ref: string | null;
  tx_hash: string | null;
  log_index: number | null;
  beneficiary: string;
  asset: string;
  amount_raw: string;
  state: string;
  week: string | null;
  conversion_operation_id: string | null;
  payout_order_id: string | null;
  reinvest_trade_id: string | null;
  created_at: string;
};

export function rewardReceiptToDto(row: {
  id: string;
  source: RewardSource;
  sourceRef: string | null;
  txHash: string | null;
  logIndex: number | null;
  beneficiary: string;
  asset: string;
  amountRaw: Prisma.Decimal;
  state: string;
  week: string | null;
  conversionOperationId: string | null;
  payoutOrderId: string | null;
  reinvestTradeId: string | null;
  createdAt: Date;
}): RewardReceiptDto {
  return {
    id: row.id,
    source: row.source,
    source_ref: row.sourceRef,
    tx_hash: row.txHash,
    log_index: row.logIndex,
    beneficiary: row.beneficiary,
    asset: row.asset,
    amount_raw: row.amountRaw.toString(),
    state: row.state,
    week: row.week,
    conversion_operation_id: row.conversionOperationId,
    payout_order_id: row.payoutOrderId,
    reinvest_trade_id: row.reinvestTradeId,
    created_at: row.createdAt.toISOString(),
  };
}

type RewardEvent = {
  logIndex: number;
  asset: string;
  amountRaw: bigint;
  sourceRef: string;
};

type Provenance = {
  pool?: string;
  stockId?: string;
  locker?: string;
  lockId?: string;
  distribution?: string;
  launchId?: string;
  hook?: string;
};

const SOURCE_FOR: Record<string, RewardSource> = {
  pool: "hydrex_lp_fees",
  locker: "hydropump_creator_fees",
  stonks: "stonks_distribution",
  feel: "feel_distribution",
  basestonk: "basestonk_hook_fees",
};

async function txLogs(txHash: Hex): Promise<readonly Log[]> {
  const receipt = await publicClientFor().getTransactionReceipt({ hash: txHash });
  return receipt.logs;
}

// Recognize only actual fee/distribution realization proved by logs of the source
// contract: each emitted reward log for the beneficiary becomes one receipt event.
async function decodeRewardEvents(input: {
  providerId: string;
  provenance: unknown;
  logs: readonly Log[];
  account: Address;
  chainId: number;
}): Promise<RewardEvent[]> {
  const prov = (input.provenance ?? {}) as Provenance;
  const account = input.account.toLowerCase();
  const out: RewardEvent[] = [];
  const client = publicClientFor();
  if (typeof prov.pool === "string") {
    const pool = prov.pool;
    const stock = prov.stockId ? await db.stock.findUnique({ where: { id: prov.stockId } }) : null;
    const settlement = settlementAssetKey(readManifest());
    const poolLogs = input.logs.filter((l) => l.address.toLowerCase() === pool.toLowerCase());
    if (poolLogs.length === 0) return out;
    const parsed = parseEventLogs({
      abi: hydrexPoolAbi,
      logs: poolLogs,
      eventName: ["FeeClaimed", "RewardsClaimed"],
    });
    for (const p of parsed) {
      if (p.eventName === "FeeClaimed") {
        if (p.args.account.toLowerCase() !== account) continue;
        if (p.args.settlementOut > 0n) {
          out.push({ logIndex: p.logIndex, asset: settlement, amountRaw: p.args.settlementOut, sourceRef: pool });
        }
        if (p.args.stockOut > 0n && stock?.assetKey) {
          out.push({ logIndex: p.logIndex, asset: stock.assetKey, amountRaw: p.args.stockOut, sourceRef: pool });
        }
      } else {
        if (p.args.account.toLowerCase() !== account) continue;
        if (p.args.stockOut > 0n && stock?.assetKey) {
          out.push({ logIndex: p.logIndex, asset: stock.assetKey, amountRaw: p.args.stockOut, sourceRef: pool });
        }
      }
    }
    return out;
  }
  if (typeof prov.locker === "string" && prov.lockId !== undefined) {
    const locker = prov.locker;
    const lockerLogs = input.logs.filter((l) => l.address.toLowerCase() === locker.toLowerCase());
    if (lockerLogs.length === 0) return out;
    const parsed = parseEventLogs({
      abi: hydropumpLockerAbi,
      logs: lockerLogs,
      eventName: ["FeesClaimed"],
    });
    for (const p of parsed) {
      if (p.args.beneficiary.toLowerCase() !== account) continue;
      if (p.args.amount <= 0n) continue;
      const locks = await client.readContract({
        address: locker as Address,
        abi: hydropumpLockerAbi,
        functionName: "locks",
        args: [p.args.lockId],
      });
      const settlement = (locks as unknown as { settlement: Address }).settlement;
      out.push({
        logIndex: p.logIndex,
        asset: assetKey("testnet", input.chainId, settlement.toLowerCase()),
        amountRaw: p.args.amount,
        sourceRef: `${locker}:${p.args.lockId.toString()}`,
      });
    }
    return out;
  }
  if (typeof prov.distribution === "string" && typeof prov.launchId === "string") {
    const source = SOURCE_FOR[input.providerId];
    if (!source) return out;
    const distribution = prov.distribution;
    const distLogs = input.logs.filter((l) => l.address.toLowerCase() === distribution.toLowerCase());
    if (distLogs.length === 0) return out;
    const parsed = parseEventLogs({
      abi: stockDistributionAbi,
      logs: distLogs,
      eventName: ["Claimed"],
    });
    const rewardTokenValue: unknown = await client.readContract({
      address: distribution as Address,
      abi: stockDistributionAbi,
      functionName: "rewardTokenOf",
      args: [prov.launchId as Hex],
    });
    const rewardAsset = assetKey("testnet", input.chainId, (rewardTokenValue as Address).toLowerCase());
    for (const p of parsed) {
      if (p.args.account.toLowerCase() !== account) continue;
      if (p.args.amount <= 0n) continue;
      out.push({ logIndex: p.logIndex, asset: rewardAsset, amountRaw: p.args.amount, sourceRef: prov.launchId });
    }
    return out;
  }
  if (typeof prov.hook === "string" && typeof prov.launchId === "string") {
    const hook = prov.hook;
    const hookLogs = input.logs.filter((l) => l.address.toLowerCase() === hook.toLowerCase());
    if (hookLogs.length === 0) return out;
    const parsed = parseEventLogs({
      abi: hookFeeAbi,
      logs: hookLogs,
      eventName: ["FeesClaimed"],
    });
    const feeTokenValue: unknown = await client.readContract({
      address: hook as Address,
      abi: hookFeeAbi,
      functionName: "feeTokenOf",
      args: [prov.launchId as Hex],
    });
    const feeAsset = assetKey("testnet", input.chainId, (feeTokenValue as Address).toLowerCase());
    for (const p of parsed) {
      if (p.args.recipient.toLowerCase() !== account) continue;
      if (p.args.amount <= 0n) continue;
      out.push({ logIndex: p.logIndex, asset: feeAsset, amountRaw: p.args.amount, sourceRef: prov.launchId });
    }
    return out;
  }
  return out;
}

// Maps a receipt beneficiary address back to its owning user through the user's
// execution/managed accounts.
export async function userIdForBeneficiary(
  client: Pick<Tx, "wallet" | "custodyProfile" | "user">,
  beneficiary: string,
): Promise<string | null> {
  const normalized = beneficiary.toLowerCase();
  const wallets = await client.wallet.findMany({
    where: { OR: [{ executionAddress: { equals: normalized, mode: "insensitive" } }] },
  });
  for (const w of wallets) {
    if (w.executionAddress?.toLowerCase() === normalized && w.userId) return w.userId;
  }
  const profiles = await client.custodyProfile.findMany({ where: { kind: "provider_managed" } });
  for (const p of profiles) {
    if (p.managedAddress?.toLowerCase() === normalized && p.walletId) {
      const wallet = await client.wallet.findUnique({ where: { id: p.walletId } });
      if (wallet?.userId) return wallet.userId;
    }
  }
  return null;
}

class RewardService {
  // Records finalized onchain reward/fee realizations as immutable receipts keyed
  // by (network, source, txHash, logIndex, beneficiary): replaying the same event
  // (worker retry or a second operation carrying the same tx) yields one receipt
  // and one ledger credit. Zero-amount logs prove nothing and create no receipt.
  async recordFinalized(operationId: string, tx?: Tx): Promise<void> {
    const run = async (client: Tx): Promise<void> => {
      const op = await client.onchainOperation.findUnique({ where: { id: operationId } });
      if (op?.kind !== "strategy" || op?.status !== "finalized" || !op?.txHash) return;
      const expected = (op.expected ?? {}) as { quote?: unknown };
      if (!expected.quote) return;
      const quote = unpack(expected.quote) as StrategyQuote;
      const strategy = await client.strategy.findUnique({ where: { id: quote.request.strategyId } });
      if (!strategy) return;
      const source =
        (strategy.provenance as Provenance | null)?.pool !== undefined
          ? SOURCE_FOR.pool
          : (strategy.provenance as Provenance | null)?.locker !== undefined
            ? SOURCE_FOR.locker
            : SOURCE_FOR[op.providerId];
      if (!source) return;
      const account = await accountAddressFor(client, op);
      const logs = await txLogs(op.txHash as Hex);
      const events = await decodeRewardEvents({
        providerId: op.providerId,
        provenance: strategy.provenance,
        logs,
        account,
        chainId: quote.request.context.chainId,
      });
      const beneficiary = account.toLowerCase();
      for (const event of events) {
        if (event.amountRaw <= 0n) continue;
        const existing = await client.rewardReceipt.findUnique({
          where: {
            networkId_source_txHash_logIndex_beneficiary: {
              networkId: op.networkId,
              source,
              txHash: op.txHash,
              logIndex: event.logIndex,
              beneficiary,
            },
          },
        });
        if (existing) continue;
        const week = lagosWeek(now());
        const row = await client.rewardReceipt.create({
          data: {
            networkId: op.networkId,
            source,
            sourceRef: event.sourceRef,
            txHash: op.txHash,
            logIndex: event.logIndex,
            beneficiary,
            asset: event.asset,
            amountRaw: toDbRaw(event.amountRaw),
            // The accrual week is fixed at the source event; late recognition rolls
            // forward to a later payout without changing it.
            accrualPeriod: week,
            week,
            state: "received_asset",
          },
        });
        // One credit per receipt; the journal key is idempotent on replay.
        const stock = await client.stock.findFirst({ where: { assetKey: event.asset } });
        const chain = stock?.chain ?? "testnet";
        await ledgerService.post(
          client,
          rewardReceived({
            key: `reward:${row.id}`,
            source,
            userId: op.userId,
            chain,
            stockId: stock?.id ?? null,
            amount: event.amountRaw,
          }),
        );
        if (stock) {
          // A received reward asset opens a zero-cost lot, so a later consent-bound
          // conversion sell has a tracked basis and its gain is classified as a
          // sale gain, separate from the distribution receipt itself.
          const existingLot = await client.positionLot.findFirst({
            where: { userId: op.userId, stockId: stock.id, operationId: op.id, source: `reward:${source}` },
          });
          if (!existingLot) {
            await client.positionLot.create({
              data: {
                userId: op.userId,
                stockId: stock.id,
                asset: event.asset,
                operationId: op.id,
                quantity: toDbRaw(event.amountRaw),
                costUsdc: toDbRaw(0n),
                source: `reward:${source}`,
              },
            });
          }
        }
      }
    };
    if (tx) return run(tx);
    return withTx((t) => run(t));
  }

  // Starts a consent-bound sell of a stock-asset receipt through the normal
  // investment path. Returns the onchain operation ID; the receipt stays
  // conversion_pending until the sale finalizes and earningsService.recognize
  // records the proceeds once. Replaying returns the same operation.
  async convert(receiptId: string, authorizationId: string): Promise<string> {
    const receipt = await db.rewardReceipt.findUniqueOrThrow({ where: { id: receiptId } });
    if (receipt.state === "conversion_pending" && receipt.conversionOperationId) {
      return receipt.conversionOperationId;
    }
    if (receipt.state !== "received_asset") {
      throw new ConflictException("Receipt is not awaiting conversion", "CONVERSION_PENDING");
    }
    const stock = await db.stock.findFirst({ where: { assetKey: receipt.asset } });
    if (!stock) {
      throw new UnprocessableEntityException(
        "Receipt asset is already the settlement asset; recognize it instead of converting",
        "CAPABILITY_UNAVAILABLE",
      );
    }
    const auth = await db.investmentAuthorization.findUniqueOrThrow({ where: { id: authorizationId } });
    if (auth.revokedAt || auth.expiresAt <= now()) {
      throw new ConflictException("Authorization is no longer active", "AUTHORIZATION_REVOKED");
    }
    // Background conversion requires an explicit standing reward_conversion consent.
    if (
      auth.kind !== "standing" ||
      !auth.actions.includes("reward_conversion") ||
      !auth.stockIds.includes(stock.id)
    ) {
      throw new UnprocessableEntityException(
        "Authorization does not cover reward conversion for this stock",
        "AUTHORIZATION_EXCEEDED",
      );
    }
    const wallets = await db.wallet.findMany({ where: { userId: auth.userId } });
    const addresses = new Set<string>();
    for (const w of wallets) {
      if (w.executionAddress) addresses.add(w.executionAddress.toLowerCase());
    }
    const profiles = await db.custodyProfile.findMany({
      where: { walletId: { in: wallets.map((w) => w.id) }, kind: "provider_managed" },
    });
    for (const p of profiles) {
      if (p.managedAddress) addresses.add(p.managedAddress.toLowerCase());
    }
    if (!addresses.has(receipt.beneficiary)) {
      throw new NotFoundException("Receipt not found", "NOT_FOUND");
    }
    const key = `convert:${receiptId}`;
    const quote = await investmentService.quote(auth.userId, {
      stockId: stock.id,
      side: "sell",
      inputRaw: fromDbRaw(receipt.amountRaw),
    });
    const investment = await investmentService.confirm(auth.userId, quote.id, authorizationId, key, {
      standingAction: "reward_conversion",
    });
    if (!investment.operation_id) {
      throw new ConflictException("Conversion needs a fresh quote and confirmation", "NEEDS_CONFIRMATION");
    }
    await db.rewardReceipt.update({
      where: { id: receiptId },
      data: { state: "conversion_pending", conversionOperationId: investment.operation_id },
    });
    await jobService.enqueue(db, { kind: "operation.progress", subjectId: investment.operation_id });
    return investment.operation_id;
  }

  // Owner-scoped receipt lookup; cross-user receipt IDs are a 404.
  async getOwned(userId: string, receiptId: string): Promise<RewardReceiptDto> {
    const wallets = await db.wallet.findMany({ where: { userId } });
    const addresses = new Set<string>();
    for (const w of wallets) {
      if (w.executionAddress) addresses.add(w.executionAddress.toLowerCase());
    }
    const profiles = await db.custodyProfile.findMany({
      where: { walletId: { in: wallets.map((w) => w.id) }, kind: "provider_managed" },
    });
    for (const p of profiles) {
      if (p.managedAddress) addresses.add(p.managedAddress.toLowerCase());
    }
    const row = await db.rewardReceipt.findUnique({ where: { id: receiptId } });
    if (!row || !addresses.has(row.beneficiary)) {
      throw new NotFoundException("Receipt not found", "NOT_FOUND");
    }
    return rewardReceiptToDto(row);
  }

  // Owner-scoped receipt list: a receipt belongs to the user through their
  // execution/managed account addresses, never through a raw beneficiary input.
  async listForUser(userId: string): Promise<RewardReceiptDto[]> {
    const wallets = await db.wallet.findMany({ where: { userId } });
    const addresses = new Set<string>();
    for (const w of wallets) {
      if (w.executionAddress) addresses.add(w.executionAddress.toLowerCase());
    }
    const profiles = await db.custodyProfile.findMany({
      where: { walletId: { in: wallets.map((w) => w.id) }, kind: "provider_managed" },
    });
    for (const p of profiles) {
      if (p.managedAddress) addresses.add(p.managedAddress.toLowerCase());
    }
    if (addresses.size === 0) return [];
    const rows = await db.rewardReceipt.findMany({
      where: { beneficiary: { in: [...addresses] } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(rewardReceiptToDto);
  }
}

export const rewardService = new RewardService();
