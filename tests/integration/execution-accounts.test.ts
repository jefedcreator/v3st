import { describe, expect, it } from "vitest";

import type { OnchainOperation } from "@/server/prisma";
import { accountAddressFor } from "@/backend/services/execution";
import { executionAccounts } from "@/backend/services/wallets/execution-accounts";
import { db } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { makeUserWithWallets } from "../helpers/factories";

useTestDatabase();

describe("execution accounts", () => {
  it("gives a user one execution account per network and reuses it", async () => {
    const user = await makeUserWithWallets();
    const a = await executionAccounts.ensure(user.id, 31337);
    const b = await executionAccounts.ensure(user.id, 31337);
    expect(b.accountAddress).toBe(a.accountAddress);
    expect(await db.executionAccount.count({ where: { walletId: a.wallet.id } })).toBe(1);
    expect(await executionAccounts.find(user.id, 84532)).toBeNull();
  });

  it("binds a Base Sepolia operation to that network's account, never the local one", async () => {
    const user = await makeUserWithWallets();
    const local = await executionAccounts.ensure(user.id, 31337);
    const network = await db.onchainNetwork.create({
      data: {
        networkId: "basesepolia:84532",
        chainId: 84532,
        kind: "verified_provider_testnet",
        deploymentId: "sepolia-deployment-test",
        label: "Base Sepolia (test row)",
        rpcLoopback: false,
      },
    });
    const op = {
      walletId: local.wallet.id,
      custodyProfileId: local.custodyProfileId,
      networkId: network.id,
    } as OnchainOperation;
    // No account on this network yet: fail closed instead of falling back to the
    // local execution address.
    await expect(accountAddressFor(db, op)).rejects.toThrow(/execution account missing/i);
    const sepoliaAddress = "0x00000000000000000000000000000000000084ba";
    await db.executionAccount.create({
      data: {
        walletId: local.wallet.id,
        chainId: 84532,
        deploymentId: network.deploymentId,
        address: sepoliaAddress,
        custodyProfileId: local.custodyProfileId,
      },
    });
    expect(await accountAddressFor(db, op)).toBe(sepoliaAddress);
    expect((await accountAddressFor(db, op)).toLowerCase()).not.toBe(local.accountAddress.toLowerCase());
  });
});
