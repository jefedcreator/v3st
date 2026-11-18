import { CUSTOMER_DOCUMENTS } from "@/backend/content/documents";
import { db } from "@/server/db";
import type { WaitlistEntryDto, WaitlistJoinDto, WaitlistSource } from "@/types/landing";

class WaitlistService {
  // The answer is identical whether the email is new, already on the list or a
  // honeypot hit, so nobody can test whether an address is stored.
  async join(input: {
    email: string;
    source: WaitlistSource;
    website?: string;
  }): Promise<WaitlistJoinDto> {
    if (input.website) return { joined: true };
    await db.waitlistEntry.createMany({
      data: [
        {
          email: input.email,
          source: input.source,
          privacyVersion: CUSTOMER_DOCUMENTS.privacy.version,
        },
      ],
      skipDuplicates: true,
    });
    return { joined: true };
  }

  async list(input: { page: number; size: number }): Promise<{
    items: WaitlistEntryDto[];
    total: number;
  }> {
    const [total, rows] = await Promise.all([
      db.waitlistEntry.count(),
      db.waitlistEntry.findMany({
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.size,
        take: input.size,
      }),
    ]);
    return {
      total,
      items: rows.map((row) => ({
        email: row.email,
        source: row.source as WaitlistSource,
        privacy_version: row.privacyVersion,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }
}

export const waitlistService = new WaitlistService();
