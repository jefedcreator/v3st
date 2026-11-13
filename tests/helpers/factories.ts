import { randomUUID } from "node:crypto";

import { Prisma, type ProviderId, type User } from "@/server/prisma";
import { db, withTx } from "@/server/db";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { openingBalance } from "@/backend/services/ledger/postings";

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
