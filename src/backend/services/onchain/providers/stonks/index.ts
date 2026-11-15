import { UnverifiedProviderError } from "@/backend/services/onchain/registry";

import { stonksCapabilities, stonksStrategyReplica } from "./replica";

export { stonksCapabilities, stonksStrategyReplica, StonksReplicaError } from "./replica";
export { parseStonksClaim, STONKS_SCHEMA_VERSION, StonksSchemaError } from "./schemas";

// No verified Stonks test deployment exists; the actual factory refuses to construct
// (see docs/decisions/onchain-providers.md).
export function createActualStonksProvider(): never {
  throw new UnverifiedProviderError(
    "Stonks Exchange: no verified test deployment; actual adapter disabled, local versioned distribution replica only",
  );
}

export const stonksProviderDescriptor = {
  id: "stonks" as const,
  capabilities: stonksCapabilities,
  betaAdapter: "local_testnet_replica" as const,
  actualFactory: createActualStonksProvider,
  strategy: stonksStrategyReplica,
  // Stays empty by design: the real provider surface is never called in beta.
  realProviderCalls: [] as string[],
};
