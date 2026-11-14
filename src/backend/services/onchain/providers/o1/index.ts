import { UnverifiedProviderError } from "@/backend/services/onchain/registry";

import { o1Capabilities, o1Replica } from "./replica";

export { o1Capabilities, o1Replica };
export { O1ReplicaError, O1_FIXTURE_FEE_BPS } from "./replica";
export { parseO1Prepared, parseO1Quote, O1_SCHEMA_VERSION } from "./schemas";

// The documented o1 aggregator deployment is Base mainnet only; until testnet
// evidence exists, the actual provider factory refuses to construct.
export function createActualO1Provider(): never {
  throw new UnverifiedProviderError(
    "o1 Exchange: documented aggregator is mainnet-only; no verified testnet evidence (see docs/decisions/onchain-providers.md)",
  );
}

export const o1ProviderDescriptor = {
  id: "o1" as const,
  capabilities: o1Capabilities,
  betaAdapter: "local_testnet_replica" as const,
  actualFactory: createActualO1Provider,
  replica: o1Replica,
};
