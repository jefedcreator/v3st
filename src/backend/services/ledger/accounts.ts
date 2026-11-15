import type { LedgerOwner, ProviderId } from "@/server/prisma";

export type Asset = "USD" | "USDC" | `STOCK:${string}`;

export type AccountSpec = {
  code: string;
  asset: Asset;
  ownerType: LedgerOwner;
  userId: string | null;
  allowNegative: boolean;
};

const userAccount = (
  userId: string,
  suffix: string,
  asset: Asset,
): AccountSpec => ({
  code: `user:${userId}:${suffix}`,
  asset,
  ownerType: "user",
  userId,
  allowNegative: false,
});

export const acct = {
  userCash: (userId: string, chain: string): AccountSpec =>
    userAccount(userId, `cash:${chain}`, "USDC"),
  userReserved: (userId: string, chain: string): AccountSpec =>
    userAccount(userId, `reserved:${chain}`, "USDC"),
  userEarnings: (userId: string, chain: string): AccountSpec =>
    userAccount(userId, `earnings:${chain}`, "USDC"),
  userPending: (userId: string): AccountSpec =>
    userAccount(userId, "pending", "USDC"),
  userStock: (userId: string, stockId: string): AccountSpec =>
    userAccount(userId, `stock:${stockId}`, `STOCK:${stockId}`),
  userStockReserved: (userId: string, stockId: string): AccountSpec =>
    userAccount(userId, `stock:${stockId}:reserved`, `STOCK:${stockId}`),
  float: (provider: ProviderId): AccountSpec => ({
    code: `float:${provider}`,
    asset: "USD",
    ownerType: "float",
    userId: null,
    allowNegative: true,
  }),
  payoutsInFlight: (provider: ProviderId): AccountSpec => ({
    code: `inflight:${provider}`,
    asset: "USD",
    ownerType: "float",
    userId: null,
    allowNegative: false,
  }),
  external: (provider: ProviderId, asset: Asset): AccountSpec => ({
    code: `ext:${provider}:${asset}`,
    asset,
    ownerType: "external",
    userId: null,
    allowNegative: true,
  }),
  treasury: (chain: string): AccountSpec => ({
    code: `treasury:${chain}`,
    asset: "USDC",
    ownerType: "treasury",
    userId: null,
    allowNegative: false,
  }),
  treasuryOutbound: (chain: string): AccountSpec => ({
    code: `treasury:${chain}:outbound`,
    asset: "USDC",
    ownerType: "treasury",
    userId: null,
    allowNegative: false,
  }),
  claimsClearing: (): AccountSpec => ({
    code: "clearing:claims",
    asset: "USDC",
    ownerType: "clearing",
    userId: null,
    allowNegative: true,
  }),
  venue: (venueId: string, asset: Asset): AccountSpec => ({
    code: `venue:${venueId}:${asset}`,
    asset,
    ownerType: "venue",
    userId: null,
    allowNegative: true,
  }),
  earningsSource: (source: string): AccountSpec => ({
    code: `ext:earnings:${source}`,
    asset: "USDC",
    ownerType: "external",
    userId: null,
    allowNegative: true,
  }),
  // External source account for a realized onchain reward in its own asset
  // (stock receipts post against a STOCK asset, settlement proceeds against USDC).
  rewardSource: (source: string, asset: Asset): AccountSpec => ({
    code: `ext:reward:${source}:${asset}`,
    asset,
    ownerType: "external",
    userId: null,
    allowNegative: true,
  }),
  equityOpening: (asset: Asset): AccountSpec => ({
    code: `equity:opening:${asset}`,
    asset,
    ownerType: "equity",
    userId: null,
    allowNegative: true,
  }),
};
