import type { Prisma, User } from "@/server/prisma";
import { withTx } from "@/server/db";
import type { KycDto, PersonaDto } from "@/types/dto";
import { ConflictException } from "@/utils/exceptions";

import { BETA_PERSONAS, type PersonaId } from "./personas";

export type { PersonaId } from "./personas";

function toKycDto(user: User): KycDto {
  return {
    status: user.kycStatus,
    tier: user.kycTier,
    verified_name: user.verifiedName,
    simulated: user.kycMode === "simulated",
  };
}

class KycService {
  personas(): PersonaDto[] {
    return BETA_PERSONAS.map((p) => ({
      id: p.id,
      label: p.label,
      tier: p.tier,
      outcome: p.outcome,
    }));
  }

  async verify(userId: string, input: { persona: PersonaId }): Promise<KycDto> {
    const persona = BETA_PERSONAS.find((p) => p.id === input.persona);
    if (!persona) {
      throw new ConflictException("Unknown persona", "VALIDATION_FAILED");
    }
    return withTx(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.kycStatus === "verified" && user.kycPersona !== persona.id) {
        throw new ConflictException(
          "Already verified with a different persona",
          "ALREADY_VERIFIED",
        );
      }
      const data: Prisma.UserUpdateInput = {
        kycStatus: persona.outcome,
        kycTier: persona.tier,
        verifiedName: persona.name,
        kycPersona: persona.id,
        kycProfile: persona.profile,
        kycMode: "simulated",
      };
      const updated = await tx.user.update({ where: { id: userId }, data });
      return toKycDto(updated);
    });
  }
}

export const kycService = new KycService();
