import { UnverifiedProviderError } from "@/backend/services/onchain/registry";
import type { StrategyAdapter, StrategyPlan, StrategyQuote, StrategyRequest } from "@/backend/services/onchain/types";
import { db } from "@/server/db";

import {
  hydrexExitRealizedCapabilities,
  hydrexExitRealizedStrategyReplica,
  hydrexSpotCapabilities,
  hydrexSpotReplica,
  hydrexStrategyReplica,
} from "./replica";

// Routes each strategy row to its declared fee-realization variant: separateClaim
// strategies use the manual claim adapter, embedded-fee strategies use the
// exit-realized adapter (claim unsupported, fees paid with principal on exit).
async function adapterForStrategy(strategyId: string): Promise<StrategyAdapter> {
  const strategy = await db.strategy.findUnique({ where: { id: strategyId } });
  return strategy?.separateClaim === false ? hydrexExitRealizedStrategyReplica : hydrexStrategyReplica;
}

export const hydrexStrategyDispatcher: StrategyAdapter = {
  get capabilities() {
    return hydrexSpotCapabilities;
  },
  quote(input: StrategyRequest): Promise<StrategyQuote> {
    return adapterForStrategy(input.strategyId).then((adapter) => adapter.quote(input));
  },
  prepare(quote: StrategyQuote, operationId: string): Promise<StrategyPlan> {
    return adapterForStrategy(quote.request.strategyId).then((adapter) => adapter.prepare(quote, operationId));
  },
};

export {
  HYDREX_FIXTURE_FEE_BPS,
  HydrexReplicaError,
  hydrexExitRealizedCapabilities,
  hydrexExitRealizedStrategyReplica,
  hydrexSpotCapabilities,
  hydrexSpotReplica,
  hydrexStrategyReplica,
  poolAddressOf,
  type HydrexStrategyProvenance,
} from "./replica";
export { HYDREX_SCHEMA_VERSION, HydrexSchemaError, parseHydrexQuote } from "./schemas";

// The Hydropump fixture declares permanently locked principal and beneficiary-only
// fee claims. It is provenance/eligibility evidence only and is never registered as
// an ordinary redeemable income strategy.
export const hydropumpLockerDescriptor = {
  providerId: "hydrex" as const,
  feature: "hydropump_permanent_lock",
  permanentlyLocked: true,
  beneficiaryOnlyFeeClaims: true,
  redeemable: false,
};

// No verified Hydrex/Hydropump testnet deployment exists; the actual provider
// factory refuses to construct (see docs/decisions/onchain-providers.md).
export function createActualHydrexProvider(): never {
  throw new UnverifiedProviderError(
    "Hydrex/Hydropump: no verified stock-paired pool or test deployment; actual adapter disabled, local pool/locker replicas only",
  );
}

export const hydrexProviderDescriptor = {
  id: "hydrex" as const,
  capabilities: hydrexSpotCapabilities,
  strategyCapabilities: hydrexSpotCapabilities,
  exitRealizedCapabilities: hydrexExitRealizedCapabilities,
  betaAdapter: "local_testnet_replica" as const,
  actualFactory: createActualHydrexProvider,
  replica: hydrexSpotReplica,
  strategy: hydrexStrategyDispatcher,
  exitRealizedStrategy: hydrexExitRealizedStrategyReplica,
  hydropump: hydropumpLockerDescriptor,
};
