import { describe, expect, it } from "vitest";

import { bankAccountService } from "@/backend/services/bank-accounts";
import { ProviderError } from "@/backend/services/ramp/errors";
import { register, rampRegistry, reset } from "@/backend/services/ramp";
import { db } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { makeVerifiedUser } from "../helpers/factories";

useTestDatabase();

describe("bank accounts", () => {
  it("stores a name-matched account as the single active destination", async () => {
    const u = await makeVerifiedUser("ada_tier2");
    const first = await bankAccountService.add(u.id, {
      bank_code: "sim-bank-a",
      account_number: "0123456789",
    });
    expect(first.account_number_masked).toBe("******6789");
    expect(first.resolved_name).toBe("ADAEZE OBI");
    await bankAccountService.add(u.id, {
      bank_code: "sim-bank-b",
      account_number: "0000000000",
    });
    const active = await db.bankAccount.findMany({
      where: { userId: u.id, status: "active" },
    });
    expect(active).toHaveLength(1);
    expect(active[0]!.accountNumber).toBe("0000000000");
    expect(
      await db.bankAccount.count({ where: { userId: u.id, status: "replaced" } }),
    ).toBe(1);
    expect(await bankAccountService.getActive(u.id)).toMatchObject({
      account_number_masked: "******0000",
    });
  });

  it("rejects a third-party account and keeps the previous destination", async () => {
    const u = await makeVerifiedUser("ada_tier2");
    await bankAccountService.add(u.id, {
      bank_code: "sim-bank-a",
      account_number: "0123456789",
    });
    await expect(
      bankAccountService.add(u.id, {
        bank_code: "sim-bank-a",
        account_number: "0345678912",
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: "NAME_MISMATCH" });
    const active = await db.bankAccount.findFirstOrThrow({
      where: { userId: u.id, status: "active" },
    });
    expect(active.accountNumber).toBe("0123456789");
    expect(
      await db.bankAccount.count({ where: { userId: u.id, status: "rejected" } }),
    ).toBe(1);
  });

  it("stores nothing when name resolution is unavailable", async () => {
    const u = await makeVerifiedUser("ada_tier2");
    const base = rampRegistry.get("yellowcard");
    register({
      ...base,
      resolveBankAccount: () => {
        throw new ProviderError("transient", "UNAVAILABLE");
      },
    });
    try {
      await expect(
        bankAccountService.add(u.id, {
          bank_code: "sim-bank-a",
          account_number: "0123456789",
        }),
      ).rejects.toMatchObject({ statusCode: 503, code: "RAIL_UNAVAILABLE" });
      expect(await db.bankAccount.count({ where: { userId: u.id } })).toBe(0);
    } finally {
      reset();
      register(base);
    }
  });

  it("lists supported banks", async () => {
    const u = await makeVerifiedUser("ada_tier2");
    void u;
    const banks = await bankAccountService.listBanks();
    expect(banks.length).toBeGreaterThan(0);
    expect(banks[0]).toHaveProperty("bank_code");
    expect(banks[0]).toHaveProperty("bank_name");
  });
});
