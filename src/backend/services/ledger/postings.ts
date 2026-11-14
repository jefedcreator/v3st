import type { ProviderId } from "@/server/prisma";

import { acct, type AccountSpec } from "./accounts";

export type EntryInput = {
  debit: AccountSpec;
  credit: AccountSpec;
  amount: bigint;
};

export type JournalInput = {
  key: string;
  kind: string;
  orderId: string | null;
  entries: EntryInput[];
};

const entry = (
  debit: AccountSpec,
  credit: AccountSpec,
  amount: bigint,
): EntryInput => ({ debit, credit, amount });

export function depositReceived(input: {
  orderId: string;
  provider: ProviderId;
  userId: string;
  usd: bigint;
}): JournalInput {
  return {
    key: `deposit:${input.orderId}:received`,
    kind: "depositReceived",
    orderId: input.orderId,
    entries: [
      entry(acct.external(input.provider, "USD"), acct.float(input.provider), input.usd),
      entry(acct.claimsClearing(), acct.userPending(input.userId), input.usd),
    ],
  };
}

export function depositReceivedDirect(input: {
  orderId: string;
  provider: ProviderId;
  userId: string;
  chain: string;
  amount: bigint;
}): JournalInput {
  return {
    key: `deposit:${input.orderId}:received`,
    kind: "depositReceivedDirect",
    orderId: input.orderId,
    entries: [
      entry(
        acct.external(input.provider, "USDC"),
        acct.userCash(input.userId, input.chain),
        input.amount,
      ),
    ],
  };
}

export function transferReserved(input: {
  id: string;
  chain: string;
  amount: bigint;
}): JournalInput {
  return {
    key: `transfer:${input.id}:reserved`,
    kind: "transferReserved",
    orderId: null,
    entries: [
      entry(acct.treasury(input.chain), acct.treasuryOutbound(input.chain), input.amount),
    ],
  };
}

export function transferReleased(input: {
  id: string;
  chain: string;
  amount: bigint;
}): JournalInput {
  return {
    key: `transfer:${input.id}:released`,
    kind: "transferReleased",
    orderId: null,
    entries: [
      entry(acct.treasuryOutbound(input.chain), acct.treasury(input.chain), input.amount),
    ],
  };
}

export function userFunded(input: {
  id: string;
  userId: string;
  chain: string;
  amount: bigint;
  to: "cash" | "earnings";
}): JournalInput {
  const destination =
    input.to === "cash"
      ? acct.userCash(input.userId, input.chain)
      : acct.userEarnings(input.userId, input.chain);
  return {
    key: `transfer:${input.id}:settled`,
    kind: "userFunded",
    orderId: null,
    entries: [
      entry(acct.treasuryOutbound(input.chain), destination, input.amount),
      entry(acct.userPending(input.userId), acct.claimsClearing(), input.amount),
    ],
  };
}

export function cashReserved(input: {
  key: string;
  userId: string;
  chain: string;
  amount: bigint;
  from: "cash" | "earnings";
}): JournalInput {
  const source =
    input.from === "cash"
      ? acct.userCash(input.userId, input.chain)
      : acct.userEarnings(input.userId, input.chain);
  return {
    key: `${input.key}:reserve`,
    kind: "cashReserved",
    orderId: null,
    entries: [entry(source, acct.userReserved(input.userId, input.chain), input.amount)],
  };
}

export function cashReleased(input: {
  key: string;
  userId: string;
  chain: string;
  amount: bigint;
  to: "cash" | "earnings";
}): JournalInput {
  const destination =
    input.to === "cash"
      ? acct.userCash(input.userId, input.chain)
      : acct.userEarnings(input.userId, input.chain);
  return {
    key: `${input.key}:release`,
    kind: "cashReleased",
    orderId: null,
    entries: [entry(acct.userReserved(input.userId, input.chain), destination, input.amount)],
  };
}

export function stockReserved(input: {
  key: string;
  userId: string;
  stockId: string;
  quantity: bigint;
}): JournalInput {
  return {
    key: `${input.key}:reserve`,
    kind: "stockReserved",
    orderId: null,
    entries: [
      entry(
        acct.userStock(input.userId, input.stockId),
        acct.userStockReserved(input.userId, input.stockId),
        input.quantity,
      ),
    ],
  };
}

export function stockReleased(input: {
  key: string;
  userId: string;
  stockId: string;
  quantity: bigint;
}): JournalInput {
  return {
    key: `${input.key}:release`,
    kind: "stockReleased",
    orderId: null,
    entries: [
      entry(
        acct.userStockReserved(input.userId, input.stockId),
        acct.userStock(input.userId, input.stockId),
        input.quantity,
      ),
    ],
  };
}

export function payoutCollected(input: {
  id: string;
  userId: string;
  chain: string;
  amount: bigint;
}): JournalInput {
  return {
    key: `transfer:${input.id}:settled`,
    kind: "payoutCollected",
    orderId: null,
    entries: [
      entry(acct.userReserved(input.userId, input.chain), acct.treasury(input.chain), input.amount),
    ],
  };
}

export function payoutSubmitted(input: {
  orderId: string;
  provider: ProviderId;
  usd: bigint;
}): JournalInput {
  return {
    key: `payout:${input.orderId}:submitted`,
    kind: "payoutSubmitted",
    orderId: input.orderId,
    entries: [
      entry(acct.float(input.provider), acct.payoutsInFlight(input.provider), input.usd),
    ],
  };
}

export function payoutPaid(input: {
  orderId: string;
  provider: ProviderId;
  usd: bigint;
}): JournalInput {
  return {
    key: `payout:${input.orderId}:paid`,
    kind: "payoutPaid",
    orderId: input.orderId,
    entries: [
      entry(acct.payoutsInFlight(input.provider), acct.external(input.provider, "USD"), input.usd),
    ],
  };
}

export function payoutRejected(input: {
  orderId: string;
  provider: ProviderId;
  usd: bigint;
  userId: string;
  debitUsdc: bigint;
}): JournalInput {
  return {
    key: `payout:${input.orderId}:rejected`,
    kind: "payoutRejected",
    orderId: input.orderId,
    entries: [
      entry(acct.payoutsInFlight(input.provider), acct.float(input.provider), input.usd),
      entry(acct.claimsClearing(), acct.userPending(input.userId), input.debitUsdc),
    ],
  };
}

export function directPayoutCollected(input: {
  id: string;
  provider: ProviderId;
  userId: string;
  chain: string;
  amount: bigint;
}): JournalInput {
  return {
    key: `transfer:${input.id}:settled`,
    kind: "directPayoutCollected",
    orderId: null,
    entries: [
      entry(
        acct.userReserved(input.userId, input.chain),
        acct.external(input.provider, "USDC"),
        input.amount,
      ),
    ],
  };
}

export function directPayoutRefunded(input: {
  orderId: string;
  provider: ProviderId;
  userId: string;
  chain: string;
  amount: bigint;
  to: "cash" | "earnings";
}): JournalInput {
  const destination =
    input.to === "cash"
      ? acct.userCash(input.userId, input.chain)
      : acct.userEarnings(input.userId, input.chain);
  return {
    key: `payout:${input.orderId}:refunded`,
    kind: "directPayoutRefunded",
    orderId: input.orderId,
    entries: [entry(acct.external(input.provider, "USDC"), destination, input.amount)],
  };
}

export function tradeFilled(input: {
  id: string;
  userId: string;
  chain: string;
  venueId: string;
  stockId: string;
  side: "buy" | "sell";
  amountIn: bigint;
  amountOut: bigint;
}): JournalInput {
  const venueUsdc = acct.venue(input.venueId, "USDC");
  const venueStock = acct.venue(input.venueId, `STOCK:${input.stockId}`);
  const entries =
    input.side === "buy"
      ? [
          entry(acct.userReserved(input.userId, input.chain), venueUsdc, input.amountIn),
          entry(venueStock, acct.userStock(input.userId, input.stockId), input.amountOut),
        ]
      : [
          entry(acct.userStockReserved(input.userId, input.stockId), venueStock, input.amountIn),
          entry(venueUsdc, acct.userCash(input.userId, input.chain), input.amountOut),
        ];
  return {
    key: `trade:${input.id}:filled`,
    kind: "tradeFilled",
    orderId: null,
    entries,
  };
}

export function earningHarvested(input: {
  userId: string;
  stockId: string;
  week: string;
  chain: string;
  amount: bigint;
}): JournalInput {
  return {
    key: `earning:${input.userId}:${input.stockId}:${input.week}`,
    kind: "earningHarvested",
    orderId: null,
    entries: [
      entry(
        acct.earningsSource(input.stockId),
        acct.userEarnings(input.userId, input.chain),
        input.amount,
      ),
    ],
  };
}

export function floatToppedUp(input: {
  id: string;
  provider: ProviderId;
  chain: string;
  amountUsdc: bigint;
  usd: bigint;
}): JournalInput {
  return {
    key: `treasury-op:${input.id}:complete`,
    kind: "floatToppedUp",
    orderId: null,
    entries: [
      entry(acct.treasuryOutbound(input.chain), acct.external(input.provider, "USDC"), input.amountUsdc),
      entry(acct.external(input.provider, "USD"), acct.float(input.provider), input.usd),
    ],
  };
}

export function floatWithdrawalRequested(input: {
  id: string;
  provider: ProviderId;
  usd: bigint;
}): JournalInput {
  return {
    key: `treasury-op:${input.id}:requested`,
    kind: "floatWithdrawalRequested",
    orderId: null,
    entries: [entry(acct.float(input.provider), acct.external(input.provider, "USD"), input.usd)],
  };
}

export function floatWithdrawalReceived(input: {
  id: string;
  provider: ProviderId;
  chain: string;
  amount: bigint;
}): JournalInput {
  return {
    key: `treasury-op:${input.id}:complete`,
    kind: "floatWithdrawalReceived",
    orderId: null,
    entries: [entry(acct.external(input.provider, "USDC"), acct.treasury(input.chain), input.amount)],
  };
}

export function openingBalance(input: {
  account: AccountSpec;
  amount: bigint;
}): JournalInput {
  return {
    key: `opening:${input.account.code}`,
    kind: "openingBalance",
    orderId: null,
    entries: [entry(acct.equityOpening(input.account.asset), input.account, input.amount)],
  };
}
