import type { RampOrder } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { customerReference, toKobo } from "@/backend/services/app/format";
import { customerChain } from "@/backend/services/app/network";
import { appOnboardingService } from "@/backend/services/app/onboarding";
import { bankAccountService } from "@/backend/services/bank-accounts";
import { depositService } from "@/backend/services/deposits";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { orderService } from "@/backend/services/orders";
import { ratesService } from "@/backend/services/rates";
import { scenarioService } from "@/backend/services/scenarios";
import { securityService } from "@/backend/services/security";
import { withdrawalService } from "@/backend/services/withdrawals";
import type { AppProgress } from "@/types/app";
import { sha256Hex } from "@/utils";
import { ConflictException, InternalServerErrorException } from "@/utils/exceptions";
import type { Rate } from "@/utils/money";
import type { AppCashDto, AppPayToDto, AppDepositDto, AppBankDto, AppBankAccountDto, AppWithdrawalPreviewDto, AppWithdrawalDto } from "@/types/app";

export type { AppCashDto, AppPayToDto, AppDepositDto, AppBankDto, AppBankAccountDto, AppWithdrawalPreviewDto, AppWithdrawalDto } from "@/types/app";

export function depositProgress(order: RampOrder): { status: AppProgress; title: string } {
  if (order.holdReason) {
    return { status: "action_needed", title: "We need to check this transfer" };
  }
  switch (order.status) {
    case "created":
    case "awaiting_transfer":
      return { status: "waiting", title: "Waiting for your transfer" };
    case "received":
    case "funded":
      return { status: "processing", title: "Adding to your cash" };
    case "settled":
      return { status: "completed", title: "Money added" };
    case "expired":
      return { status: "cancelled", title: "Transfer window closed" };
    case "refunded":
      return { status: "failed", title: "Transfer returned" };
    case "failed":
      return { status: "failed", title: "Transfer didn't go through" };
    default:
      return { status: "processing", title: "Adding to your cash" };
  }
}

export function withdrawalProgress(
  order: RampOrder,
  bank: AppBankAccountDto,
): { status: AppProgress; title: string } {
  switch (order.status) {
    case "paid":
      return { status: "completed", title: `Sent to ${bank.bank_name} ••${bank.account_ending}` };
    case "reversed":
      return { status: "failed", title: "Returned to your cash" };
    case "failed":
      return { status: "failed", title: "Withdrawal didn't go through" };
    default:
      return { status: "processing", title: "Sending to your bank" };
  }
}

class AppCashService {
  async balance(userId: string): Promise<AppCashDto> {
    const chain = customerChain();
    let rate: Rate | null = null;
    try {
      rate = (await ratesService.display()).payoutRate;
    } catch {
      rate = null;
    }
    const available = await ledgerService.balance(acct.userCash(userId, chain));
    const onHold = await ledgerService.balance(acct.userReserved(userId, chain));
    const incoming = await ledgerService.balance(acct.userPending(userId));
    const koboOrNull = (microUsd: bigint): string | null =>
      rate === null ? null : toKobo(microUsd, rate).toString();
    return {
      available_kobo: koboOrNull(available),
      on_hold_kobo: koboOrNull(onHold),
      incoming_kobo: koboOrNull(incoming),
      as_of: now().toISOString(),
    };
  }

  private depositDto(order: RampOrder): AppDepositDto {
    const { status, title } = depositProgress(order);
    const payTo: AppPayToDto | null = order.payToAccountNumber
      ? {
          bank_name: order.payToBankName ?? "",
          account_number: order.payToAccountNumber,
          account_name: order.payToAccountName ?? "",
          reference: order.payToReference,
          amount_kobo: order.ngnAmount.toString(),
          expires_at: order.expiresAt ? order.expiresAt.toISOString() : null,
        }
      : null;
    return {
      id: order.id,
      reference: customerReference(order.id),
      status,
      title,
      amount_kobo: order.ngnAmount.toString(),
      fee_kobo: order.feeNgn === null ? null : order.feeNgn.toString(),
      you_get_kobo:
        order.feeNgn === null ? null : (order.ngnAmount - order.feeNgn).toString(),
      pay_to: payTo,
      created_at: order.createdAt.toISOString(),
    };
  }

  async addMoney(
    userId: string,
    amountKobo: bigint,
    clientKey: string,
  ): Promise<{ dto: AppDepositDto; created: boolean }> {
    await appOnboardingService.assertReady(userId, "add_money");
    const { deposit, created } = await depositService.create(
      userId,
      { ngn_amount: amountKobo },
      `app-deposit:${userId}:${clientKey}`,
      { chain: customerChain() },
    );
    const order = await db.rampOrder.findUniqueOrThrow({ where: { id: deposit.id } });
    return { dto: this.depositDto(order), created };
  }

  async getDeposit(userId: string, id: string): Promise<AppDepositDto> {
    const order = await orderService.getOwned(userId, id, ["deposit"]);
    return this.depositDto(order);
  }

  async completeBetaDeposit(userId: string, id: string): Promise<AppDepositDto> {
    await scenarioService.run(userId, { order_id: id, scenario: "deposit_paid" });
    return this.getDeposit(userId, id);
  }

  async banks(): Promise<AppBankDto[]> {
    const banks = await bankAccountService.listBanks();
    return banks.map((bank) => ({ code: bank.bank_code, name: bank.bank_name }));
  }

  async bankAccount(userId: string): Promise<AppBankAccountDto | null> {
    const row = await bankAccountService.getActiveRow(userId);
    if (!row) return null;
    return {
      bank_name: row.bankName,
      account_ending: row.accountNumber.slice(-4),
      account_name: row.resolvedName,
    };
  }

  async setBankAccount(
    userId: string,
    input: { bankCode: string; accountNumber: string; pin: string },
  ): Promise<AppBankAccountDto> {
    await appOnboardingService.assertReady(userId, "add_money");
    await securityService.verifyPin(userId, input.pin);
    await bankAccountService.add(userId, {
      bank_code: input.bankCode,
      account_number: input.accountNumber,
    });
    const dto = await this.bankAccount(userId);
    if (!dto) {
      throw new InternalServerErrorException("Bank account was not stored");
    }
    return dto;
  }

  async previewWithdrawal(
    userId: string,
    amountKobo: bigint,
  ): Promise<AppWithdrawalPreviewDto> {
    await appOnboardingService.assertReady(userId, "withdraw");
    const quote = await withdrawalService.quote(
      userId,
      { ngn_amount: amountKobo },
      { chain: customerChain() },
    );
    const to = await this.bankAccount(userId);
    if (!to) {
      throw new InternalServerErrorException("Bank account missing after readiness check");
    }
    return {
      preview_id: quote.id,
      amount_kobo: quote.ngn_amount,
      fee_kobo: quote.fee_ngn,
      you_receive_kobo: quote.net_ngn,
      to,
      expires_at: quote.expires_at,
    };
  }

  async withdraw(
    userId: string,
    input: { previewId: string; pin: string },
    clientKey: string,
  ): Promise<{ dto: AppWithdrawalDto; created: boolean }> {
    const key = `withdrawal:${userId}:app-withdrawal:${userId}:${clientKey}`;
    const requestHash = sha256Hex(input.previewId);
    const existing = await db.rampOrder.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          "Idempotency key reused with a different preview",
          "IDEMPOTENCY_KEY_REUSED",
        );
      }
      return { dto: await this.withdrawalDto(existing), created: false };
    }
    await appOnboardingService.assertReady(userId, "withdraw");
    await securityService.verifyPin(userId, input.pin);
    const { withdrawal, created } = await withdrawalService.confirm(
      userId,
      input.previewId,
      `app-withdrawal:${userId}:${clientKey}`,
    );
    const order = await db.rampOrder.findUniqueOrThrow({ where: { id: withdrawal.id } });
    return { dto: await this.withdrawalDto(order), created };
  }

  async getWithdrawal(userId: string, id: string): Promise<AppWithdrawalDto> {
    const order = await orderService.getOwned(userId, id, ["withdrawal"]);
    return this.withdrawalDto(order);
  }

  private async withdrawalDto(order: RampOrder): Promise<AppWithdrawalDto> {
    const active = await bankAccountService.getActiveRow(order.userId);
    const to: AppBankAccountDto = {
      bank_name: order.destBankName ?? active?.bankName ?? "",
      account_ending: (order.destAccountNumber ?? active?.accountNumber ?? "").slice(-4),
      account_name: order.destAccountName ?? active?.resolvedName ?? "",
    };
    const { status, title } = withdrawalProgress(order, to);
    const fee = order.feeNgn ?? 0n;
    return {
      id: order.id,
      reference: customerReference(order.id),
      status,
      title,
      amount_kobo: order.ngnAmount.toString(),
      fee_kobo: fee.toString(),
      you_receive_kobo: (order.netNgn ?? order.ngnAmount - fee).toString(),
      to,
      bank_reference: order.bankReference,
      created_at: order.createdAt.toISOString(),
    };
  }
}

export const appCashService = new AppCashService();
