import { UnverifiedProviderError } from "@/backend/services/onchain/registry";

import { bankrReplicaGateway } from "./gateway";
import { bankrCapabilities, bankrReplica } from "./replica";

export { bankrCapabilities, bankrReplica, BankrReplicaError, BANKR_FIXTURE_FEE_BPS, managedAccountOf } from "./replica";
export { bankrReplicaGateway, BankrGatewayReplica, BANKR_GATEWAY_TIMEOUT } from "./gateway";
export {
  BANKR_SCHEMA_VERSION,
  BankrSchemaError,
  decimalStringToRaw,
  normalizeBankrSwap,
  parseBankrQuote,
  parseBankrSwapEnvelope,
  rawToDecimalString,
} from "./schemas";

// Bankr's real hostname is never contacted in beta: no verified testnet deployment
// or per-customer account-isolation evidence exists, so the actual factory refuses
// to construct (see docs/decisions/onchain-providers.md).
export function createActualBankrProvider(): never {
  throw new UnverifiedProviderError(
    "Bankr: no verified testnet deployment; actual gateway disabled, local managed-wallet replica only",
  );
}

export const bankrProviderDescriptor = {
  id: "bankr" as const,
  capabilities: bankrCapabilities,
  betaAdapter: "local_testnet_replica" as const,
  actualFactory: createActualBankrProvider,
  replica: bankrReplica,
  gateway: bankrReplicaGateway,
};
