import { onchainRegistry } from "@/backend/services/onchain/registry";

import { bankrProviderDescriptor } from "./bankr";
import { basestonkProviderDescriptor } from "./basestonk";
import { feelProviderDescriptor } from "./feel";
import { hydrexProviderDescriptor } from "./hydrex";
import { hydrexActualSpot, hydrexActualStrategy } from "./hydrex/actual";
import { o1ProviderDescriptor } from "./o1";
import { stonksProviderDescriptor } from "./stonks";

// Registers every beta provider replica with the onchain registry. Actual provider
// factories stay disabled until verified testnet evidence exists.
onchainRegistry.register("o1", {
  spot: () => o1ProviderDescriptor.replica,
  actual: () => o1ProviderDescriptor.actualFactory(),
});
onchainRegistry.register("bankr", {
  spot: () => bankrProviderDescriptor.replica,
  actual: () => bankrProviderDescriptor.actualFactory(),
});
onchainRegistry.register("hydrex", {
  spot: () => hydrexProviderDescriptor.replica,
  strategy: () => hydrexProviderDescriptor.strategy,
  actual: () => hydrexProviderDescriptor.actualFactory(),
  // Real Hydrex adapters for Base Sepolia (verified testnet evidence, 2026-11-16).
  verified: {
    spot: () => hydrexActualSpot,
    strategy: () => hydrexActualStrategy,
  },
});
// Distribution providers expose no spot adapter in beta; registry.spot() rejects them
// explicitly (unsupported capability), and their actual factories stay disabled.
onchainRegistry.register("stonks", {
  strategy: () => stonksProviderDescriptor.strategy,
  actual: () => stonksProviderDescriptor.actualFactory(),
});
onchainRegistry.register("basestonk", {
  strategy: () => basestonkProviderDescriptor.strategy,
  actual: () => basestonkProviderDescriptor.actualFactory(),
});
onchainRegistry.register("feel", {
  strategy: () => feelProviderDescriptor.strategy,
  actual: () => feelProviderDescriptor.actualFactory(),
});

export {
  bankrProviderDescriptor,
  basestonkProviderDescriptor,
  feelProviderDescriptor,
  hydrexProviderDescriptor,
  o1ProviderDescriptor,
  stonksProviderDescriptor,
};
