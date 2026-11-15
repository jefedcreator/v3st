import { Prisma, type ChainTransfer, type TransferPurpose, type TransferStatus, type TreasuryWallet, type Wallet } from "@/server/prisma";
import { db, withTx, type Tx } from "@/server/db";
import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
import { integrationModes } from "@/backend/integrations/beta-policy";
import { ledgerService } from "@/backend/services/ledger";
import { transferReleased, transferReserved } from "@/backend/services/ledger/postings";
import { jobService } from "@/backend/services/jobs";
import { screeningService } from "@/backend/services/screening";
import { ConflictException, NotFoundException } from "@/utils/exceptions";
import { fromDbRaw, toDbRaw } from "@/utils/asset-units";

import { CHAINS, assertChain, type Chain } from "./chains";
import { assertTransferPolicy, PolicyViolation } from "./policy";
import { simulatedWalletProvider } from "./simulated";

export type TransferFrom = { kind: "user"; userId: string } | { kind: "treasury" };
export type TransferTo =
  | { kind: "user"; userId: string }
  | { kind: "treasury" }
  | { kind: "external"; address: string };

export type TransferSpec = {
  key: string;
  purpose: TransferPurpose;
  chain: Chain;
  amount: bigint;
  from: TransferFrom;
  to: TransferTo;
  orderId?: string;
  treasuryOperationId?: string;
};

class WalletService {
  async ensureUserWallets(userId: string): Promise<Wallet[]> {
    const mode = integrationModes().wallets;
    for (const chain of Object.keys(CHAINS) as Chain[]) {
      const family = CHAINS[chain].family;
      const existing = await db.wallet.findUnique({
        where: { userId_family: { userId, family } },
      });
      if (existing) continue;
      const created = await simulatedWalletProvider.createWallet({ ownerKey: userId, family });
      try {
        await db.wallet.create({
          data: {
            userId,
            family,
            address: created.address,
            providerWalletId: created.providerWalletId,
            providerMode: mode,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          continue;
        }
        throw error;
      }
    }
    return db.wallet.findMany({ where: { userId } });
  }

  async ensureTreasuryWallets(): Promise<TreasuryWallet[]> {
    const mode = integrationModes().wallets;
    for (const chain of Object.keys(CHAINS) as Chain[]) {
      const existing = await db.treasuryWallet.findUnique({ where: { chain } });
      if (existing) continue;
      const created = await simulatedWalletProvider.createWallet({
        ownerKey: `treasury:${chain}`,
        family: CHAINS[chain].family,
      });
      try {
        await db.treasuryWallet.create({
          data: {
            chain,
            address: created.address,
            providerWalletId: created.providerWalletId,
            providerMode: mode,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          continue;
        }
        throw error;
      }
    }
    return db.treasuryWallet.findMany();
  }

  async treasuryAddress(chain: Chain): Promise<string> {
    await this.ensureTreasuryWallets();
    const wallet = await db.treasuryWallet.findUniqueOrThrow({ where: { chain } });
    return wallet.address;
  }

  private async resolveFrom(tx: Tx, chain: Chain, from: TransferFrom): Promise<string> {
    if (from.kind === "treasury") {
      return this.treasuryAddress(chain);
    }
    const wallet = await tx.wallet.findUnique({
      where: { userId_family: { userId: from.userId, family: CHAINS[chain].family } },
    });
    if (!wallet) {
      throw new NotFoundException("Wallet not provisioned", "WALLET_NOT_READY");
    }
    return wallet.address;
  }

  private async resolveTo(tx: Tx, chain: Chain, to: TransferTo): Promise<string> {
    if (to.kind === "external") return to.address;
    if (to.kind === "treasury") return this.treasuryAddress(chain);
    const wallet = await tx.wallet.findUnique({
      where: { userId_family: { userId: to.userId, family: CHAINS[chain].family } },
    });
    if (!wallet) {
      throw new NotFoundException("Wallet not provisioned", "WALLET_NOT_READY");
    }
    return wallet.address;
  }

  async createTransfer(tx: Tx, spec: TransferSpec): Promise<ChainTransfer> {
    const chain = assertChain(spec.chain);
    const existing = await tx.chainTransfer.findUnique({ where: { key: spec.key } });
    if (existing) return existing;
    const fromAddress = await this.resolveFrom(tx, chain, spec.from);
    const toAddress = await this.resolveTo(tx, chain, spec.to);
    const fromTreasury = spec.from.kind === "treasury";
    const status: TransferStatus =
      fromTreasury && spec.amount >= policy.treasury.quorumThresholdMicroUsdc
        ? "awaiting_approval"
        : "pending";
    const created = await tx.chainTransfer.create({
      data: {
        key: spec.key,
        purpose: spec.purpose,
        status,
        chain,
        token: CHAINS[chain].usdc,
        fromAddress,
        toAddress,
        amount: toDbRaw(spec.amount),
        orderId: spec.orderId ?? null,
        treasuryOperationId: spec.treasuryOperationId ?? null,
        approvals: [],
        providerMode: integrationModes().wallets,
      },
    });
    if (fromTreasury) {
      await ledgerService.post(
        tx,
        transferReserved({ id: created.id, chain, amount: spec.amount }),
      );
    }
    await jobService.enqueue(tx, { kind: "chain.progress", subjectId: created.id });
    return created;
  }

  private async specFromTransfer(tx: Tx, t: ChainTransfer): Promise<TransferSpec> {
    const chain = assertChain(t.chain);
    const treasury = await this.treasuryAddress(chain);
    let from: TransferFrom;
    if (t.fromAddress === treasury) {
      from = { kind: "treasury" };
    } else {
      const wallet = await tx.wallet.findUnique({
        where: { family_address: { family: CHAINS[chain].family, address: t.fromAddress } },
      });
      if (!wallet) throw new NotFoundException("Source wallet unknown", "WALLET_NOT_READY");
      from = { kind: "user", userId: wallet.userId };
    }
    let to: TransferTo;
    if (t.toAddress === treasury) {
      to = { kind: "treasury" };
    } else {
      const wallet = await tx.wallet.findUnique({
        where: { family_address: { family: CHAINS[chain].family, address: t.toAddress } },
      });
      to = wallet ? { kind: "user", userId: wallet.userId } : { kind: "external", address: t.toAddress };
    }
    return {
      key: t.key,
      purpose: t.purpose,
      chain,
      amount: fromDbRaw(t.amount),
      from,
      to,
      orderId: t.orderId ?? undefined,
      treasuryOperationId: t.treasuryOperationId ?? undefined,
    };
  }

  private async boundAddress(
    tx: Tx,
    chain: Chain,
    spec: TransferSpec,
  ): Promise<string | null> {
    if (spec.from.kind !== "user") return null;
    if (spec.purpose === "direct_payout_funding" && spec.orderId) {
      const order = await tx.rampOrder.findUnique({ where: { id: spec.orderId } });
      if (order?.fundingAddress && order.fundingAmount === spec.amount) {
        return order.fundingAddress;
      }
      return null;
    }
    return this.treasuryAddress(chain);
  }

  private async fromRef(
    tx: Tx,
    chain: Chain,
    spec: TransferSpec,
  ): Promise<{ providerWalletId: string; address: string }> {
    if (spec.from.kind === "treasury") {
      const wallet = await tx.treasuryWallet.findUniqueOrThrow({ where: { chain } });
      return { providerWalletId: wallet.providerWalletId, address: wallet.address };
    }
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { userId_family: { userId: spec.from.userId, family: CHAINS[chain].family } },
    });
    return { providerWalletId: wallet.providerWalletId, address: wallet.address };
  }

  async progressTransfer(transferId: string): Promise<ChainTransfer> {
    return withTx(async (tx) => {
      const t = await tx.chainTransfer.findUniqueOrThrow({ where: { id: transferId } });
      if (t.status === "awaiting_approval" || t.status === "confirmed" || t.status === "failed") {
        return t;
      }
      const chain = assertChain(t.chain);
      if (t.status === "pending") {
        const spec = await this.specFromTransfer(tx, t);
        const bound = await this.boundAddress(tx, chain, spec);
        try {
          const screened = await screeningService.screen(chain, t.toAddress);
          if (screened === "deny") throw new PolicyViolation("SCREENING_DENIED");
          assertTransferPolicy(spec, {
            fromAddress: t.fromAddress,
            toAddress: t.toAddress,
            boundAddress: bound,
          });
        } catch (error) {
          if (!(error instanceof PolicyViolation)) throw error;
          const failed = await tx.chainTransfer.update({
            where: { id: t.id },
            data: { status: "failed", failureReason: error.code },
          });
          if (spec.from.kind === "treasury") {
            await ledgerService.post(
              tx,
              transferReleased({ id: t.id, chain, amount: fromDbRaw(t.amount) }),
            );
          }
          return failed;
        }
        const remote = await simulatedWalletProvider.getTransfer(t.key);
        let txHash: string;
        if (remote) {
          txHash = remote.txHash;
        } else {
          const from = await this.fromRef(tx, chain, spec);
          const submitted = await simulatedWalletProvider.submitTransfer({
            key: t.key,
            chain,
            from,
            to: t.toAddress,
            token: t.token,
            amount: fromDbRaw(t.amount),
          });
          txHash = submitted.txHash;
        }
        const updated = await tx.chainTransfer.update({
          where: { id: t.id },
          data: { status: "submitted", txHash },
        });
        await jobService.enqueue(tx, {
          kind: "chain.progress",
          subjectId: t.id,
          runAt: new Date(now().getTime() + CHAINS[chain].confirmSeconds * 1_000),
        });
        return updated;
      }
      const remote = await simulatedWalletProvider.getTransfer(t.key);
      if (!remote || remote.status === "pending") return t;
      return tx.chainTransfer.update({
        where: { id: t.id },
        data: {
          status: remote.status,
          failureReason: remote.failureReason,
          txHash: remote.txHash,
        },
      });
    });
  }

  async approveTransfer(transferId: string, operatorId: string): Promise<ChainTransfer> {
    return withTx(async (tx) => {
      const t = await tx.chainTransfer.findUniqueOrThrow({ where: { id: transferId } });
      if (t.status !== "awaiting_approval") {
        throw new ConflictException("Transfer is not awaiting approval", "STALE_STATE");
      }
      if (t.approvals.includes(operatorId)) {
        throw new ConflictException("Operator already approved", "ALREADY_APPROVED");
      }
      const approvals = [...t.approvals, operatorId];
      const status: TransferStatus = approvals.length >= 2 ? "pending" : "awaiting_approval";
      const updated = await tx.chainTransfer.update({
        where: { id: t.id },
        data: { approvals, status },
      });
      if (status === "pending") {
        await jobService.enqueue(tx, { kind: "chain.progress", subjectId: t.id });
      }
      return updated;
    });
  }

  async observeIncoming(
    chain: Chain,
    txHash: string,
    expect: { to: string; amount: bigint },
  ): Promise<"confirmed" | "pending" | "mismatch"> {
    const tx = await simulatedWalletProvider.getByHash(chain, txHash);
    if (!tx) return "mismatch";
    if (tx.to !== expect.to || tx.amount !== expect.amount) return "mismatch";
    if (tx.status === "confirmed") return "confirmed";
    if (tx.status === "pending") return "pending";
    return "mismatch";
  }
}

export const walletService = new WalletService();
