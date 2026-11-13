import type { ProviderMode } from "@/backend/integrations/beta-policy";
import type { BankAccountStatus, EarningsMode, KycStatus, UserRole, WalletFamily } from "@/server/prisma";

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

export type BankAccountDto = {
  id: string;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  status: BankAccountStatus;
  name_match: boolean;
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
