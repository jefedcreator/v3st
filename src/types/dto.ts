import type { ProviderMode } from "@/backend/integrations/beta-policy";
import type { EarningsMode, KycStatus, UserRole, WalletFamily } from "@/server/prisma";

export type BetaDto = { stage: "beta"; mode: ProviderMode; test_funds_only: true };

export function betaDto(mode: ProviderMode): BetaDto {
  return { stage: "beta", mode, test_funds_only: true };
}

export type KycDto = {
  status: KycStatus;
  tier: number;
  verified_name: string | null;
  simulated: boolean;
};

export type PersonaDto = {
  id: string;
  label: string;
  tier: number;
  outcome: "verified" | "rejected";
};

export type BankDto = {
  bank_code: string;
  bank_name: string;
};

export type BankAccountDto = {
  id: string;
  bank_code: string;
  bank_name: string;
  account_number_masked: string;
  resolved_name: string;
  created_at: string;
};

export type MeDto = {
  id: string;
  phone: string;
  role: UserRole;
  kyc: KycDto;
  wallets: { family: WalletFamily; address: string }[];
  bank_account: BankAccountDto | null;
  earnings_preference: { mode: EarningsMode; stock_id: string | null };
  beta: { stage: "beta"; test_funds_only: true };
};
