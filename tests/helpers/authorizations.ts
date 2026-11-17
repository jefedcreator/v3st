import { randomUUID } from "node:crypto";

import {
  authorizationService,
  type AuthorizationDto,
} from "@/backend/services/authorizations";
import { type STANDING_ACTIONS } from "@/backend/validators/authorization.validator";

// Order actions (order_buy/order_sell) exist only via createOrderConsent, never
// through the public validator, so this helper takes the public action set.
type PublicStandingAction = (typeof STANDING_ACTIONS)[number];

export const TEST_POLICY_VERSION = "test";
export const TEST_DISCLOSURE_VERSION = "1";

// One-time consent bound to an owned persisted quote (create the quote first).
export async function oneTimeAuth(
  userId: string,
  quote: { id: string },
  quoteKind: "investment" | "strategy" = "investment",
): Promise<AuthorizationDto> {
  const { dto } = await authorizationService.create(
    userId,
    {
      kind: "one_time",
      quote_kind: quoteKind,
      quote_id: quote.id,
      policy_version: TEST_POLICY_VERSION,
      disclosure_version: TEST_DISCLOSURE_VERSION,
    },
    randomUUID(),
  );
  return dto;
}

// Standing authorization for background actions (claim, reward_conversion, ...).
export async function standingAuth(
  userId: string,
  scope: { stockIds?: string[]; strategyIds?: string[] },
  actions: PublicStandingAction[],
  overrides?: {
    maxActionNgn?: bigint;
    maxTotalNgn?: bigint;
    maxFeeBps?: number;
    maxSlippageBps?: number;
    expiresInMs?: number;
  },
): Promise<AuthorizationDto> {
  const { dto } = await authorizationService.create(
    userId,
    {
      kind: "standing",
      stock_ids: scope.stockIds ?? [],
      strategy_ids: scope.strategyIds ?? [],
      actions,
      max_action_ngn: overrides?.maxActionNgn ?? 1_000_000_000_000_000_000n,
      max_total_ngn: overrides?.maxTotalNgn ?? 1_000_000_000_000_000_000n,
      max_fee_bps: overrides?.maxFeeBps ?? 10_000,
      max_slippage_bps: overrides?.maxSlippageBps ?? 100,
      expires_at: new Date(Date.now() + (overrides?.expiresInMs ?? 7 * 86_400_000)).toISOString(),
      policy_version: TEST_POLICY_VERSION,
      disclosure_version: TEST_DISCLOSURE_VERSION,
    },
    randomUUID(),
  );
  return dto;
}
