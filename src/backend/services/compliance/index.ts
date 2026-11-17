import type { Prisma, User } from "@/server/prisma";
import { type Tx, lockRows } from "@/server/db";
import { policy } from "@/backend/config/policy";
import { lagosDayStart, lagosMonthStart } from "@/backend/services/jobs/schedule";
import type { Customer, Direction } from "@/backend/services/ramp/types";
import { ConflictException, ForbiddenException } from "@/utils/exceptions";

export function customerFor(user: User): Customer {
  const profile = (user.kycProfile ?? {}) as {
    dateOfBirth?: string | null;
    idNumber?: string | null;
    address?: string | null;
  };
  return {
    userId: user.id,
    name: user.verifiedName ?? "",
    phone: user.phone ?? null,
    country: "NG",
    dateOfBirth: profile.dateOfBirth ?? null,
    idType: "BVN",
    idNumber: profile.idNumber ?? null,
    address: profile.address ?? null,
  };
}

const CLOSED_STATUSES = ["failed", "expired", "refunded"] as const;

class ComplianceService {
  async assertCanTransact(
    tx: Tx,
    input: {
      userId: string;
      direction: Direction;
      ngnAmount: bigint;
      usdAmount: bigint;
      at: Date;
    },
  ): Promise<Customer> {
    await lockRows(tx, "users", [input.userId]);
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    if (user.kycStatus !== "verified") {
      throw new ForbiddenException("KYC verification required", "KYC_REQUIRED");
    }
    const customer = customerFor(user);
    if (input.usdAmount >= policy.compliance.travelRuleMicroUsd) {
      if (
        !customer.name ||
        !customer.dateOfBirth ||
        !customer.idNumber ||
        !customer.address
      ) {
        throw new ForbiddenException(
          "Travel rule data missing",
          "TRAVEL_RULE_DATA_MISSING",
        );
      }
    }
    const limits =
      user.kycTier >= 2 ? policy.compliance.limits.tier2 : policy.compliance.limits.tier1;
    const dayStart = lagosDayStart(input.at);
    const monthStart = lagosMonthStart(input.at);
    const baseWhere: Prisma.RampOrderWhereInput = {
      userId: input.userId,
      direction: input.direction,
      status: { notIn: [...CLOSED_STATUSES] },
    };
    const daySum = await tx.rampOrder.aggregate({
      _sum: { ngnAmount: true },
      where: { ...baseWhere, createdAt: { gte: dayStart } },
    });
    if ((daySum._sum?.ngnAmount ?? 0n) + input.ngnAmount > limits.dayKobo) {
      throw new ConflictException("Daily limit exceeded", "LIMIT_EXCEEDED");
    }
    const monthSum = await tx.rampOrder.aggregate({
      _sum: { ngnAmount: true },
      where: { ...baseWhere, createdAt: { gte: monthStart } },
    });
    if ((monthSum._sum?.ngnAmount ?? 0n) + input.ngnAmount > limits.monthKobo) {
      throw new ConflictException("Monthly limit exceeded", "LIMIT_EXCEEDED");
    }
    return customer;
  }
}

export const complianceService = new ComplianceService();
