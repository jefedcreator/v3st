import { UnverifiedProviderError } from "@/backend/services/onchain/registry";

import { basestonkCapabilities, basestonkStrategyReplica } from "./replica";

export { basestonkCapabilities, basestonkStrategyReplica, BaseStonkReplicaError } from "./replica";
export { BASESTONK_SCHEMA_VERSION, BaseStonkSchemaError, parseBaseStonkFee } from "./schemas";

// Detailed BaseStonk API/ABI is unverified; the actual factory refuses to construct
// (see docs/decisions/onchain-providers.md).
export function createActualBaseStonkProvider(): never {
  throw new UnverifiedProviderError(
    "BaseStonk: detailed API/ABI unverified; actual adapter disabled, V3ST synthetic hook/fee replica only",
  );
}

export const basestonkProviderDescriptor = {
  id: "basestonk" as const,
  capabilities: basestonkCapabilities,
  betaAdapter: "local_testnet_replica" as const,
  actualFactory: createActualBaseStonkProvider,
  strategy: basestonkStrategyReplica,
  // Stays empty by design: the real provider surface is never called in beta.
  realProviderCalls: [] as string[],
};
