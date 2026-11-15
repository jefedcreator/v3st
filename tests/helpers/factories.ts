import { randomUUID } from "node:crypto";

import type { BankAccount, ChainTransfer, Prisma, ProviderId, RampOrder, Stock, User } from "@/server/prisma";
import { db, withTx } from "@/server/db";
import { bankAccountService } from "@/backend/services/bank-accounts";
import { kycService, type PersonaId } from "@/backend/services/kyc";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { openingBalance } from "@/backend/services/ledger/postings";
import { simRamp } from "@/backend/services/simulator/ramp";
import { walletService } from "@/backend/services/wallets";

let phoneCounter = Math.floor(Math.random() * 900);

export async function makeUser(
  overrides?: Partial<Prisma.UserCreateInput>,
): Promise<User> {
  phoneCounter += 1;
  const data: Prisma.UserCreateInput = {
    phone: `+2340000000${(phoneCounter % 1000).toString().padStart(3, "0")}`,
    identitySubject: `sim-${randomUUID()}`,
    identityMode: "simulated",
  };
  if (overrides) {
    Object.assign(data, overrides);
  }
  return db.user.create({ data });
}

export async function fundCash(
  userId: string,
  microUsdc: bigint,
  chain = "base",
): Promise<void> {
  await withTx((tx) =>
    ledgerService.post(
      tx,
      openingBalance({ account: acct.userCash(userId, chain), amount: microUsdc }),
    ),
  );
}

export async function seedTreasury(chain: string, microUsdc: bigint): Promise<void> {
  await withTx((tx) =>
    ledgerService.post(
      tx,
      openingBalance({ account: acct.treasury(chain), amount: microUsdc }),
    ),
  );
  if (chain === "testnet") {
    const { seedLocalTreasury } = await import("@/backend/services/wallets/local-transfers");
    const { toDbRaw } = await import("@/utils/asset-units");
    const journal = await db.ledgerJournal.findUniqueOrThrow({ where: { key: `opening:${acct.treasury(chain).code}` } });
    await seedLocalTreasury(journal.id, await walletService.treasuryAddress("testnet"), toDbRaw(microUsdc));
  }
}

export async function creditFloat(provider: ProviderId, microUsd: bigint): Promise<void> {
  await withTx((tx) =>
    ledgerService.post(tx, {
      key: `float-credit:${provider}:${randomUUID()}`,
      kind: "openingBalance",
      orderId: null,
      entries: [
        { debit: acct.equityOpening("USD"), credit: acct.float(provider), amount: microUsd },
      ],
    }),
  );
  await simRamp.seedFloat(provider, microUsd);
}

export async function creditTreasury(chain: string, microUsdc: bigint): Promise<void> {
  await withTx((tx) =>
    ledgerService.post(tx, {
      key: `treasury-credit:${chain}:${randomUUID()}`,
      kind: "openingBalance",
      orderId: null,
      entries: [
        { debit: acct.equityOpening("USDC"), credit: acct.treasury(chain), amount: microUsdc },
      ],
    }),
  );
}

export async function seedFloat(provider: ProviderId, microUsd: bigint): Promise<void> {
  await withTx((tx) =>
    ledgerService.post(
      tx,
      openingBalance({ account: acct.float(provider), amount: microUsd }),
    ),
  );
  await simRamp.seedFloat(provider, microUsd);
}

export async function makeUserWithWallets(): Promise<User> {
  const u = await makeUser();
  await walletService.ensureUserWallets(u.id);
  return u;
}

export async function createFundingTransfer(opts?: {
  key?: string;
  amount?: bigint;
}): Promise<ChainTransfer> {
  const key = opts?.key ?? "fund:o2";
  const amount = opts?.amount ?? 4_000_000n;
  if ((await ledgerService.balance(acct.treasury("base"))) === 0n) {
    await seedTreasury("base", 1_000_000_000_000n);
  }
  const u = await makeUserWithWallets();
  return withTx((tx) =>
    walletService.createTransfer(tx, {
      key,
      purpose: "deposit_funding",
      chain: "base",
      amount,
      from: { kind: "treasury" },
      to: { kind: "user", userId: u.id },
    }),
  );
}

export async function makeVerifiedUser(persona: PersonaId = "ada_tier2"): Promise<User> {
  const u = await makeUser();
  await kycService.verify(u.id, { persona });
  return db.user.findUniqueOrThrow({ where: { id: u.id } });
}

export async function makeBankAccount(
  userId: string,
  accountNumber = "0123456789",
): Promise<BankAccount> {
  await bankAccountService.add(userId, {
    bank_code: "sim-bank-a",
    account_number: accountNumber,
  });
  return db.bankAccount.findFirstOrThrow({
    where: { userId, accountNumber, status: "active" },
  });
}

export async function makeStock(
  overrides?: Partial<Prisma.StockCreateInput>,
): Promise<Stock> {
  const data: Prisma.StockCreateInput = {
    symbol: "TSTA",
    name: "Test Stock A (simulated)",
    chain: "base",
    tokenAddress: `0x${randomUUID().replace(/-/g, "").slice(0, 40)}`,
    decimals: 6,
    enabled: true,
    simPriceMicroUsdc: 2_000_000n,
    simWeeklyEarningMicroPerShare: 200_000n,
  };
  if (overrides) {
    Object.assign(data, overrides);
  }
  return db.stock.create({ data });
}

export async function makeOrder(
  overrides?: Partial<Prisma.RampOrderCreateInput>,
): Promise<RampOrder> {
  let userId = overrides?.userId;
  if (!userId) {
    const u = await makeUser();
    userId = u.id;
  }
  const data: Prisma.RampOrderCreateInput = {
    userId,
    kind: "deposit",
    direction: "in",
    provider: "yellowcard",
    providerMode: "simulated",
    settlementModel: "partner_float",
    status: "created",
    idempotencyKey: `idem-${randomUUID()}`,
    requestHash: "test",
    ngnAmount: 100_000n,
  };
  if (overrides) {
    Object.assign(data, overrides);
  }
  return db.rampOrder.create({ data });
}
