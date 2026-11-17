import type { Prisma } from "@/server/prisma";
import { db } from "@/server/db";
import { CUSTOMER_DOCUMENTS, type DocumentSlug } from "@/backend/content/documents";
import { ConflictException } from "@/utils/exceptions";

class AgreementService {
  // Records acceptances; a version that is not the document's current version is
  // refused so customers never accept stale terms.
  async accept(
    userId: string,
    items: { slug: DocumentSlug; version: string }[],
  ): Promise<void> {
    for (const item of items) {
      const current = CUSTOMER_DOCUMENTS[item.slug];
      if (current?.version !== item.version) {
        throw new ConflictException(
          `Document ${item.slug} was updated; accept version ${current?.version ?? "unknown"}`,
          "AGREEMENT_OUTDATED",
        );
      }
    }
    const rows: Prisma.AgreementAcceptanceCreateManyInput[] = items.map((item) => ({
      userId,
      document: item.slug,
      version: item.version,
    }));
    await db.agreementAcceptance.createMany({ data: rows, skipDuplicates: true });
  }

  async acceptedCurrent(userId: string): Promise<Set<DocumentSlug>> {
    const rows = await db.agreementAcceptance.findMany({ where: { userId } });
    const accepted = new Set<DocumentSlug>();
    for (const row of rows) {
      const slug = row.document as DocumentSlug;
      const current = CUSTOMER_DOCUMENTS[slug];
      if (current?.version === row.version) {
        accepted.add(slug);
      }
    }
    return accepted;
  }
}

export const agreementService = new AgreementService();
