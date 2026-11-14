import type { Address, Hex } from "viem";

import type { Wallet } from "@/server/prisma";
import { db } from "@/server/db";
import { executionAccountAbi, settlementTokenAbi } from "@/backend/services/onchain/abis";
import {
  loadArtifact,
  publicClientFor,
  readManifest,
  relayerAccount,
  testnetService,
  walletClientFor,
} from "@/backend/services/onchain/testnet";
import { NotFoundException } from "@/utils/exceptions";

export type ExecutionAccountRef = {
  wallet: Wallet;
  accountAddress: Address;
  custodyProfileId: string;
};

class TestnetWalletService {
  async ensureExecutionAccount(userId: string): Promise<ExecutionAccountRef> {
    const wallet = await db.wallet.findUnique({
      where: { userId_family: { userId, family: "evm" } },
    });
    if (!wallet) {
      throw new NotFoundException("Wallet not provisioned", "WALLET_NOT_READY");
    }
    if (wallet.executionAddress && wallet.custodyProfileId) {
      return {
        wallet,
        accountAddress: wallet.executionAddress as Address,
        custodyProfileId: wallet.custodyProfileId,
      };
    }
    const manifest = readManifest();
    const verified = await testnetService.verify(manifest);
    if (!verified.ok) {
      throw new NotFoundException(`Testnet unavailable: ${verified.reason}`, "NETWORK_UNHEALTHY");
    }
    const account = relayerAccount();
    const walletClient = walletClientFor(account);
    const publicClient = publicClientFor();
    const artifact = loadArtifact("TestExecutionAccount");
    const hash = await walletClient.deployContract({
      abi: artifact.abi as never,
      bytecode: artifact.bytecode as Hex,
      args: [wallet.address as Address, account.address],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const accountAddress = receipt.contractAddress;
    if (!accountAddress) throw new NotFoundException("Execution account deployment failed", "NETWORK_UNHEALTHY");

    const profile = await db.custodyProfile.upsert({
      where: { kind_walletId: { kind: "application_account", walletId: wallet.id } },
      create: {
        kind: "application_account",
        label: `application account for ${userId}`,
        walletId: wallet.id,
      },
      update: {},
    });
    const updated = await db.wallet.update({
      where: { id: wallet.id },
      data: { executionAddress: accountAddress, custodyProfileId: profile.id },
    });
    return { wallet: updated, accountAddress, custodyProfileId: profile.id };
  }

  async accountState(accountAddress: Address): Promise<{ nonce: bigint; epoch: bigint }> {
    const publicClient = publicClientFor();
    const [nonce, epoch] = await Promise.all([
      publicClient.readContract({
        address: accountAddress,
        abi: executionAccountAbi,
        functionName: "nonce",
      }) as Promise<bigint>,
      publicClient.readContract({
        address: accountAddress,
        abi: executionAccountAbi,
        functionName: "authorizationEpoch",
      }) as Promise<bigint>,
    ]);
    return { nonce, epoch };
  }

  // Funds the user's testnet execution account with a real local settlement transfer
  // exactly once per ramp order (callers persist onchainFundedAt as the guard).
  async fundExecutionAccountOnce(userId: string, amountRaw: bigint): Promise<Hex | null> {
    const wallet = await db.wallet.findUnique({
      where: { userId_family: { userId, family: "evm" } },
    });
    if (!wallet?.executionAddress) return null;
    const manifest = readManifest();
    const settlement = manifest.contracts.TestSettlementToken;
    if (!settlement) throw new NotFoundException("Settlement token missing from manifest", "NETWORK_UNHEALTHY");
    const account = relayerAccount();
    const walletClient = walletClientFor(account);
    const hash = await walletClient.writeContract({
      address: settlement.address,
      abi: settlementTokenAbi,
      functionName: "mint",
      args: [wallet.executionAddress as Address, amountRaw],
    });
    await publicClientFor().waitForTransactionReceipt({ hash });
    return hash;
  }

  // Revocation must invalidate every execution account the user controls: the
  // application account and each provider_managed (Bankr-style) managed account.
  async bumpAuthorizationEpoch(userId: string): Promise<void> {
    const wallets = await db.wallet.findMany({ where: { userId } });
    if (wallets.length === 0) return;
    const targets = new Set<string>();
    for (const wallet of wallets) {
      if (wallet.executionAddress) targets.add(wallet.executionAddress.toLowerCase());
      const managed = await db.custodyProfile.findMany({
        where: { walletId: wallet.id, kind: "provider_managed" },
      });
      for (const profile of managed) {
        if (profile.managedAddress) targets.add(profile.managedAddress.toLowerCase());
      }
    }
    if (targets.size === 0) return;
    const account = relayerAccount();
    const walletClient = walletClientFor(account);
    const publicClient = publicClientFor();
    for (const address of targets) {
      const hash = await walletClient.writeContract({
        address: address as Address,
        abi: executionAccountAbi,
        functionName: "bumpAuthorizationEpoch",
      });
      await publicClient.waitForTransactionReceipt({ hash });
    }
  }
}

export const testnetWalletService = new TestnetWalletService();
