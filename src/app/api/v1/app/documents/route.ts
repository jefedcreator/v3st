import { authMiddleware, withMiddleware } from "@/backend/middleware";
import { CUSTOMER_DOCUMENTS } from "@/backend/content/documents";
import { agreementService } from "@/backend/services/agreements";
import { ok } from "@/utils/response";
import type { AppDocumentSummaryDto } from "@/types/app";

export const GET = withMiddleware<null, null, null>(
  async (request) => {
    const accepted = await agreementService.acceptedCurrent(request.user!.id);
    const documents: AppDocumentSummaryDto[] = Object.values(CUSTOMER_DOCUMENTS).map((doc) => ({
      slug: doc.slug,
      title: doc.title,
      version: doc.version,
      accepted: accepted.has(doc.slug),
    }));
    return ok(documents, "Documents");
  },
  [authMiddleware],
  { audience: "customer" },
);
