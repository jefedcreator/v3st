import type { BankAccount } from "@/server/prisma";
import { db, lockRows, withTx } from "@/server/db";
import { now } from "@/backend/clock";
import { nameMatches } from "@/backend/services/compliance/name-match";
import { ProviderError } from "@/backend/services/ramp/errors";
import { rampRegistry } from "@/backend/services/ramp";
import type { BankAccountDto, BankDto } from "@/types/dto";
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@/utils/exceptions";

const BANK_CACHE_MS = 10 * 60 * 1_000;
let bankCache: { at: number; banks: BankDto[] } | null = null;

export function maskAccountNumber(accountNumber: string): string {
  return `******${accountNumber.slice(-4)}`;
}

function toDto(row: BankAccount): BankAccountDto {
  return {
    id: row.id,
    bank_code: row.bankCode,
    bank_name: row.bankName,
    account_number_masked: maskAccountNumber(row.accountNumber),
    resolved_name: row.resolvedName,
    created_at: row.createdAt.toISOString(),
  };
}

class BankAccountService {
  async listBanks(): Promise<BankDto[]> {
    const at = now().getTime();
    if (bankCache && at - bankCache.at < BANK_CACHE_MS) {
      return bankCache.banks;
    }
    const banks = (await rampRegistry.get("yellowcard").listBanks()).map((b) => ({
      bank_code: b.code,
      bank_name: b.name,
    }));
    bankCache = { at, banks };
    return banks;
  }

  async add(
    userId: string,
    input: { bank_code: string; account_number: string },
  ): Promise<BankAccountDto> {
    const provider = rampRegistry.get("yellowcard");
    let resolvedName: string;
    try {
      resolvedName = await provider.resolveBankAccount(input.bank_code, input.account_number);
    } catch (error) {
      if (error instanceof ProviderError && error.kind === "rejected") {
        throw new NotFoundException("Bank account not found", "ACCOUNT_NOT_FOUND");
      }
      throw new ServiceUnavailableException(
        "Bank name resolution is unavailable",
        "RAIL_UNAVAILABLE",
      );
    }
    const banks = await this.listBanks();
    const bank = banks.find((b) => b.bank_code === input.bank_code);
    if (!bank) {
      throw new UnprocessableEntityException("Unknown bank code", "VALIDATION_FAILED");
    }
    const result = await withTx(async (tx) => {
      await lockRows(tx, "users", [userId]);
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.verifiedName) {
        throw new ForbiddenException("KYC verification required", "KYC_REQUIRED");
      }
      const match = nameMatches(user.verifiedName, resolvedName);
      if (!match) {
        const row = await tx.bankAccount.create({
          data: {
            userId,
            bankCode: input.bank_code,
            bankName: bank.bank_name,
            accountNumber: input.account_number,
            resolvedName,
            nameMatch: false,
            status: "rejected",
            provider: provider.id,
            providerMode: provider.mode,
          },
        });
        return { row, match };
      }
      await tx.bankAccount.updateMany({
        where: { userId, status: "active" },
        data: { status: "replaced" },
      });
      const row = await tx.bankAccount.create({
        data: {
          userId,
          bankCode: input.bank_code,
          bankName: bank.bank_name,
          accountNumber: input.account_number,
          resolvedName,
          nameMatch: true,
          status: "active",
          provider: provider.id,
          providerMode: provider.mode,
        },
      });
      return { row, match };
    });
    if (!result.match) {
      throw new UnprocessableEntityException(
        "Account name does not match the verified name",
        "NAME_MISMATCH",
      );
    }
    return toDto(result.row);
  }

  async getActiveRow(userId: string): Promise<BankAccount | null> {
    return db.bankAccount.findFirst({ where: { userId, status: "active" } });
  }

  async getActive(userId: string): Promise<BankAccountDto | null> {
    const row = await this.getActiveRow(userId);
    return row ? toDto(row) : null;
  }

  async list(userId: string): Promise<BankAccountDto[]> {
    const rows = await db.bankAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDto);
  }
}

export const bankAccountService = new BankAccountService();
