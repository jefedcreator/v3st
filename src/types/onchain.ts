export const ONCHAIN_SCENARIO_KINDS = [
  "delayed_confirmation",
  "revert",
  "partial_fill",
  "sponsor_shortage",
  "zero_rewards",
] as const;

export type OnchainScenarioKind = (typeof ONCHAIN_SCENARIO_KINDS)[number];

// User-owned local-testnet operation plus a named scenario only: no arbitrary RPC,
// mint recipient or calldata inputs are accepted.
export type OnchainScenarioInput = {
  operation_id: string;
  scenario: OnchainScenarioKind;
};

export type OnchainScenarioResult = {
  operation_id: string;
  scenario: OnchainScenarioKind;
};
