import { randomUUID } from "node:crypto";

import type { ChainTransfer, Prisma, ProviderId, RampOrder, User } from "@/server/prisma";
import { db, withTx } from "@/server/db";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { openingBalance } from "@/backend/services/ledger/postings";
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
}

export async function seedFloat(provider: ProviderId, microUsd: bigint): Promise<void> {
  await withTx((tx) =>
    ledgerService.post(
      tx,
      openingBalance({ account: acct.float(provider), amount: microUsd }),
    ),
  );
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
