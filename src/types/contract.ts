import type { TestnetEvidenceStatus } from "@/backend/integrations/provider-evidence";
import type { IntegrationKind, ProviderCapabilities, StockProviderId } from "@/backend/services/onchain/types";

// Operator evidence for one provider integration. A replica is never reported as a
// verified external integration; no secrets, endpoints or signing material appear.
export type IntegrationEvidenceDto = {
  provider_id: StockProviderId;
  integration_kind: IntegrationKind;
  beta_adapter: "local_testnet_replica";
  actual_integration: "disabled_unverified" | "verified_provider_testnet";
  verified_chain_id: number | null;
  capabilities: ProviderCapabilities;
  evidence_id: string;
  testnet_evidence: TestnetEvidenceStatus;
  real_provider_calls: number;
  limitation: string;
};

export type OnchainOpsDto = {
  network: {
    network_id: string;
    chain_id: number;
    deployment_id: string;
    verified: boolean;
    verification_reason: string | null;
  };
  unresolved_operations: number;
  operation_holds: { key: string; status: string; error_reason: string | null }[];
  sponsor_spend_today_wei: string;
  sponsor_daily_cap_wei: string;
  stale_observations: number;
};
