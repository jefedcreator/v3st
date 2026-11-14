import { onchainRegistry } from "@/backend/services/onchain/registry";

import { bankrProviderDescriptor } from "./bankr";
import { o1ProviderDescriptor } from "./o1";

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

export { bankrProviderDescriptor, o1ProviderDescriptor };
