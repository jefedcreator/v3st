import { describe, expect, it } from "vitest";

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
});
