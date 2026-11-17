import type { StockProviderId } from "@/backend/services/onchain/types";

import { OnchainPolicyError } from "./onchain-policy";

export type TestnetEvidenceStatus = "unverified" | "verified";

export type ProviderEvidence = {
  id: StockProviderId;
  documentation: { label: string; url: string; checkedAt: string }[];
  transport: string;
  apiVersion: string;
  abiVersion: string | null;
  capabilities: string[];
  testnetEvidence: {
    status: TestnetEvidenceStatus;
    chainId: number | null;
    detail: string;
  };
  betaAdapter: "local_testnet_replica" | "verified_provider_testnet" | "disabled";
  note: string;
};

const CHECKED_AT = "2026-11-14";

const EVIDENCE: Record<StockProviderId, ProviderEvidence> = {
  o1: {
    id: "o1",
    documentation: [
      {
        label: "Trading API (unsigned transactions)",
        url: "https://docs.o1.exchange/api/trading.md",
        checkedAt: "2026-11-16",
      },
      {
        label: "Launchpad trading API",
        url: "https://docs.o1.exchange/launchpad/api/trading",
        checkedAt: CHECKED_AT,
      },
    ],
    transport: "HTTPS JSON API (documented aggregator); mainnet-only documented deployment",
    apiVersion: "documented 2026-11-14; no versioned schema observed",
    abiVersion: null,
    capabilities: ["spot_quote", "unsigned_transaction_construction", "launchpad_separate"],
    testnetEvidence: {
      status: "unverified",
      chainId: null,
      detail:
        "Documented aggregator deployment is Base mainnet (8453). No verified testnet deployment; actual adapter disabled, local replica only.",
    },
    betaAdapter: "local_testnet_replica",
    note: "A /submit response is transaction construction, not a broadcast confirmation.",
  },
  bankr: {
    id: "bankr",
    documentation: [
      { label: "Wallet API swap", url: "https://docs.bankr.bot/wallet-api/swap/", checkedAt: CHECKED_AT },
      {
        label: "Partner wallet provisioning",
        url: "https://docs.bankr.bot/partnership/wallet-provisioning/",
        checkedAt: CHECKED_AT,
      },
      { label: "Wallet API guidance", url: "https://help.bankr.bot/article/wallet-api", checkedAt: CHECKED_AT },
    ],
    transport: "HTTPS JSON API signing through a Bankr-managed wallet",
    apiVersion: "documented 2026-11-14; no versioned schema observed",
    abiVersion: null,
    capabilities: ["managed_wallet_quote", "managed_wallet_swap", "location_clearance_separate"],
    testnetEvidence: {
      status: "unverified",
      chainId: null,
      detail:
        "No verified testnet deployment or per-user account isolation evidence; actual adapter disabled, separate local managed-wallet profile only.",
    },
    betaAdapter: "local_testnet_replica",
    note: "Stock execution requires location clearance even when a quote succeeds; never pool customers into one wallet.",
  },
  hydrex: {
    id: "hydrex",
    documentation: [
      { label: "Hydrex SDK", url: "https://github.com/hydrexfi/hydrex-sdk", checkedAt: "2026-11-16" },
      { label: "Protocol docs", url: "https://docs.hydrex.fi/", checkedAt: CHECKED_AT },
      { label: "Liquidity (manual fees, account-locking incentives)", url: "https://www.hydrex.fi/liquidity", checkedAt: CHECKED_AT },
      { label: "Hydropump (permanently locked liquidity, alternative fee destinations)", url: "https://www.hydrex.fi/hydropump/create", checkedAt: CHECKED_AT },
    ],
    transport: "Onchain contracts (Algebra-style pools) — no verified stock pool deployment",
    apiVersion: "n/a (onchain)",
    abiVersion: null,
    capabilities: ["spot_liquidity", "lp_fees_manual_claim", "hydropump_permanent_lock", "creator_fee_destinations"],
    testnetEvidence: {
      status: "verified",
      chainId: 84532,
      detail:
        "@hydrexfi/hydrex-sdk@1.2.8 lists Base Sepolia pool deployer, position manager and swap router; all three return code from sepolia.base.org (checked 2026-11-16). Stock pool is V3ST-deployed with a stand-in token.",
    },
    betaAdapter: "local_testnet_replica",
    note: "Hydropump principal is permanently locked; it is provenance, not a redeemable strategy.",
  },
  stonks: {
    id: "stonks",
    documentation: [
      { label: "Mechanics (stock-paired launches, versioned routers/lockers, holder distributions)", url: "https://www.thestonks.exchange/about", checkedAt: CHECKED_AT },
    ],
    transport: "Onchain contracts, versioned per generation",
    apiVersion: "n/a (onchain)",
    abiVersion: null,
    capabilities: ["stock_paired_launch", "versioned_routers", "holder_stock_distribution"],
    testnetEvidence: {
      status: "unverified",
      chainId: null,
      detail: "No verified test deployment; local versioned pool/distribution replica only. Legacy and newer pools use different contracts.",
    },
    betaAdapter: "local_testnet_replica",
    note: "Fee rights and permanently locked liquidity are separate features.",
  },
  basestonk: {
    id: "basestonk",
    documentation: [
      { label: "Product", url: "https://basestonk.io/", checkedAt: CHECKED_AT },
      { label: "Terms (public API and user-signed transactions described; no verified SDK contract)", url: "https://basestonk.io/terms", checkedAt: CHECKED_AT },
    ],
    transport: "Uniswap v4 hook-based launches; detailed API/ABI unverified",
    apiVersion: "unverified",
    abiVersion: null,
    capabilities: ["hook_fee_launches"],
    testnetEvidence: {
      status: "unverified",
      chainId: null,
      detail: "Detailed API/ABI and testnet unverified; V3ST synthetic hook/fee replica only, unknown hook versions unavailable.",
    },
    betaAdapter: "local_testnet_replica",
    note: "No public claim API is assumed; generic holder yield is not promised.",
  },
  feel: {
    id: "feel",
    documentation: [
      { label: "Launchpad", url: "https://feel.cash/launchpad", checkedAt: CHECKED_AT },
      { label: "Example holder stock-reward display", url: "https://feel.cash/base/cueball", checkedAt: CHECKED_AT },
    ],
    transport: "Onchain distribution tied to eligible launch-token snapshots",
    apiVersion: "unverified",
    abiVersion: null,
    capabilities: ["stock_reward_distribution_to_launch_holders"],
    testnetEvidence: {
      status: "unverified",
      chainId: null,
      detail: "Developer/claim contract and testnet unverified; local distribution replica only. Owning only the paired stock does not qualify.",
    },
    betaAdapter: "local_testnet_replica",
    note: "One published launch's holder rewards are not a promise for every stock or coin.",
  },
};

export function getProviderEvidence(id: StockProviderId): ProviderEvidence {
  const record = EVIDENCE[id];
  if (!record) {
    throw new OnchainPolicyError(`Unknown stock provider ${JSON.stringify(id)}`);
  }
  return record;
}

export function listProviderEvidence(): ProviderEvidence[] {
  return Object.values(EVIDENCE);
}

export function assertVerifiedTestnet(id: StockProviderId): ProviderEvidence {
  const evidence = getProviderEvidence(id);
  if (evidence.testnetEvidence.status !== "verified") {
    throw new OnchainPolicyError(
      `Provider ${id} has no verified testnet evidence (status: ${evidence.testnetEvidence.status})`,
    );
  }
  return evidence;
}
