import { UnverifiedProviderError } from "@/backend/services/onchain/registry";

import { feelCapabilities, feelStrategyReplica } from "./replica";

export { feelCapabilities, feelStrategyReplica, FeelReplicaError } from "./replica";
export { FEEL_SCHEMA_VERSION, FeelSchemaError, parseFeelClaim } from "./schemas";

// The Feel developer/claim contract and testnet are unverified; the actual factory
// refuses to construct (see docs/decisions/onchain-providers.md).
export function createActualFeelProvider(): never {
  throw new UnverifiedProviderError(
    "Feel.cash: developer/claim contract unverified; actual adapter disabled, local distribution replica only",
  );
}

export const feelProviderDescriptor = {
  id: "feel" as const,
  capabilities: feelCapabilities,
  betaAdapter: "local_testnet_replica" as const,
  actualFactory: createActualFeelProvider,
  strategy: feelStrategyReplica,
  // Stays empty by design: the real provider surface is never called in beta.
  realProviderCalls: [] as string[],
};
