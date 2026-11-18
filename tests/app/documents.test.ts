import { expect, it } from "vitest";

import { CUSTOMER_DOCUMENTS, INVEST_DOCUMENTS } from "@/backend/content/documents";

it("versions privacy on its own", () => {
  expect(CUSTOMER_DOCUMENTS.privacy.version).toBe("2026-11-18");
  for (const slug of ["terms", "risks", "how-shares-are-held", "earn-risks"] as const)
    expect(CUSTOMER_DOCUMENTS[slug].version).toBe("2026-11-17");
  expect(INVEST_DOCUMENTS).toEqual(["terms", "risks", "how-shares-are-held"]);
  expect(CUSTOMER_DOCUMENTS.privacy.body).toContain(
    "If you join the waitlist, we use your email address only to invite you to the beta.",
  );
});
