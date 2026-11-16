import type { Address, Hex } from "viem";

import { db } from "@/server/db";
import { TESTNET_CHAIN_ID } from "@/backend/integrations/onchain-policy";
import { executionAccountAbi } from "@/backend/services/onchain/abis";
import { publicClientOn } from "@/backend/services/onchain/chains";
import {
  publicClientFor,
  relayerAccount,
  walletClientFor,
} from "@/backend/services/onchain/testnet";
import { executionAccounts, type ExecutionAccountRef } from "@/backend/services/wallets/execution-accounts";

export type { ExecutionAccountRef };

class TestnetWalletService {
  async ensureExecutionAccount(userId: string): Promise<ExecutionAccountRef> {
    return executionAccounts.ensure(userId, TESTNET_CHAIN_ID);
  }

  async accountState(accountAddress: Address, chainId = 31337): Promise<{ nonce: bigint; epoch: bigint }> {
    const publicClient = chainId === 31337 ? publicClientFor() : publicClientOn(chainId);
    const [nonce, epoch] = await Promise.all([
      publicClient.readContract({
        address: accountAddress,
        abi: executionAccountAbi,
        functionName: "nonce",
      }),
      publicClient.readContract({
        address: accountAddress,
        abi: executionAccountAbi,
        functionName: "authorizationEpoch",
      }),
    ]);
    return { nonce, epoch };
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
