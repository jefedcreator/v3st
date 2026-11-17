import {
  pathParamValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { CUSTOMER_DOCUMENTS } from "@/backend/content/documents";
import {
  documentSlugParamSchema,
  type DocumentSlugParamSchema,
} from "@/backend/validators/app/onboarding.validator";
import { ok } from "@/utils/response";
import { NotFoundException } from "@/utils/exceptions";

// Public: the documents are shown before sign-in too.
export const GET = withMiddleware<null, DocumentSlugParamSchema, null>(
  async (request) => {
    const doc = CUSTOMER_DOCUMENTS[request.params!.slug];
    if (!doc) throw new NotFoundException("Document not found");
    return ok(
      { slug: doc.slug, title: doc.title, version: doc.version, body: doc.body },
      doc.title,
    );
  },
  [pathParamValidatorMiddleware(documentSlugParamSchema)],
  { audience: "customer" },
);
