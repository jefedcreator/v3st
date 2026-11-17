import type { Abi, Address, Hex } from "viem";

import type { Wallet } from "@/server/prisma";
import { db } from "@/server/db";
import { TESTNET_CHAIN_ID } from "@/backend/integrations/onchain-policy";
import { chainObject, publicClientOn, relayerOn, walletClientOn } from "@/backend/services/onchain/chains";
import { manifestFor, verifyManifest } from "@/backend/services/onchain/manifests";
import { loadArtifact } from "@/backend/services/onchain/testnet";
import { NotFoundException } from "@/utils/exceptions";

export type ExecutionAccountRef = {
  wallet: Wallet;
  accountAddress: Address;
  custodyProfileId: string;
};

// One execution account per user per network. On the local network the address is
// also mirrored on Wallet.executionAddress so existing readers keep working; on
// other networks it lives only in the execution_accounts table. The custody profile
// is unique per (kind, walletId), so every network reuses the wallet's
// application_account profile.
export const executionAccounts = {
  async ensure(userId: string, chainId: number): Promise<ExecutionAccountRef> {
    const wallet = await db.wallet.findUnique({
      where: { userId_family: { userId, family: "evm" } },
    });
    if (!wallet) {
      throw new NotFoundException("Wallet not provisioned", "WALLET_NOT_READY");
    }
    const manifest = manifestFor(chainId);
    if (chainId === TESTNET_CHAIN_ID && wallet.executionAddress && wallet.custodyProfileId) {
      if (wallet.deploymentId !== manifest.deploymentId) {
        throw new NotFoundException("Wallet deployment requires restore or a fresh isolated user", "NETWORK_UNHEALTHY");
      }
      return {
        wallet,
        accountAddress: wallet.executionAddress as Address,
        custodyProfileId: wallet.custodyProfileId,
      };
    }
    const existing = await db.executionAccount.findUnique({
      where: { walletId_deploymentId: { walletId: wallet.id, deploymentId: manifest.deploymentId } },
    });
    if (existing) {
      return { wallet, accountAddress: existing.address as Address, custodyProfileId: existing.custodyProfileId };
    }
    const verified = await verifyManifest(chainId);
    if (!verified.ok) {
      throw new NotFoundException(`Network unavailable: ${verified.reason}`, "NETWORK_UNHEALTHY");
    }
    const relayer = relayerOn(chainId);
    const walletClient = walletClientOn(chainId);
    const publicClient = publicClientOn(chainId);
    const artifact = loadArtifact("TestExecutionAccount");
    const hash = await walletClient.deployContract({
      account: relayer,
      chain: chainObject(chainId),
      abi: artifact.abi as Abi,
      bytecode: artifact.bytecode as Hex,
      args: [wallet.address as Address, relayer.address],
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
        deploymentId: manifest.deploymentId,
      },
      update: {},
    });
    await db.executionAccount.create({
      data: {
        walletId: wallet.id,
        chainId,
        deploymentId: manifest.deploymentId,
        address: accountAddress,
        custodyProfileId: profile.id,
      },
    });
    if (chainId === TESTNET_CHAIN_ID) {
      const updated = await db.wallet.update({
        where: { id: wallet.id },
        data: { executionAddress: accountAddress, custodyProfileId: profile.id, deploymentId: manifest.deploymentId },
      });
      return { wallet: updated, accountAddress, custodyProfileId: profile.id };
    }
    return { wallet, accountAddress, custodyProfileId: profile.id };
  },

  async find(userId: string, chainId: number): Promise<ExecutionAccountRef | null> {
    const wallet = await db.wallet.findUnique({
      where: { userId_family: { userId, family: "evm" } },
    });
    if (!wallet) return null;
    if (chainId === TESTNET_CHAIN_ID) {
      if (!wallet.executionAddress || !wallet.custodyProfileId) return null;
      return {
        wallet,
        accountAddress: wallet.executionAddress as Address,
        custodyProfileId: wallet.custodyProfileId,
      };
    }
    const row = await db.executionAccount.findFirst({ where: { walletId: wallet.id, chainId } });
    if (!row) return null;
    return { wallet, accountAddress: row.address as Address, custodyProfileId: row.custodyProfileId };
  },
};
