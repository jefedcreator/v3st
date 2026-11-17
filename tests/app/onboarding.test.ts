import { describe, expect, it } from "vitest";

import { GET as onboardingGET } from "@/app/api/v1/app/onboarding/route";
import { GET as testIdentitiesGET } from "@/app/api/v1/app/identity/test-identities/route";
import { POST as identityPOST } from "@/app/api/v1/app/identity/route";
import { GET as documentsGET } from "@/app/api/v1/app/documents/route";
import { GET as documentGET } from "@/app/api/v1/app/documents/[slug]/route";
import { POST as agreementsPOST } from "@/app/api/v1/app/agreements/route";
import { PUT as pinPUT } from "@/app/api/v1/app/security/pin/route";
import { CUSTOMER_DOCUMENTS, INVEST_DOCUMENTS, type DocumentSlug } from "@/backend/content/documents";
import { appOnboardingService } from "@/backend/services/app/onboarding";
import { withMiddleware } from "@/backend/middleware";
import { db } from "@/server/db";
import { ConflictException } from "@/utils/exceptions";

import { callAppRoute, ORIGIN, signInCustomer } from "../helpers/app";
import { useTestDatabase } from "../helpers/db";

useTestDatabase();

const REQUIRED_PHRASES: Record<DocumentSlug, string[]> = {
  terms: ["test money", "no real naira", "beta"],
  risks: ["can lose money", "not guaranteed", "past performance"],
  "how-shares-are-held": [
    "test shares",
    "track the price",
    "no value",
    "not direct ownership",
    "no voting rights",
    "tokenized",
  ],
  "earn-risks": ["less than you put in", "fees are not guaranteed", "every week"],
  privacy: ["email address", "bank account", "we do not store your phone number", "we do not sell"],
};

async function acceptInvestDocuments(cookie: string) {
  const res = await callAppRoute(agreementsPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/agreements`,
    cookie,
    body: {
      documents: INVEST_DOCUMENTS.map((slug) => ({
        slug,
        version: CUSTOMER_DOCUMENTS[slug].version,
      })),
    },
  });
  expect(res.status).toBe(200);
  return res;
}

describe("customer onboarding, test identities and agreements", () => {
  it("walks the steps in order and reports readiness", async () => {
    const { cookie, userId } = await signInCustomer("onboard@v3st.test");
    const first = await callAppRoute(onboardingGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/onboarding`,
      cookie,
    });
    const firstBody = first.json as { data: { complete: boolean; next_step: string; steps: { key: string; title: string; done: boolean; required: boolean }[] } };
    expect(firstBody.data.complete).toBe(false);
    expect(firstBody.data.next_step).toBe("identity");
    expect(firstBody.data.steps.map((s) => s.title)).toEqual([
      "Verify your identity",
      "Create your PIN",
      "Review and accept",
      "Add your bank account",
    ]);

    await callAppRoute(identityPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/identity`,
      cookie,
      body: { test_identity_id: "ada_tier2" },
    });
    let status = await appOnboardingService.status(userId);
    expect(status.next_step).toBe("pin");

    await callAppRoute(pinPUT, {
      method: "PUT",
      url: `${ORIGIN}/api/v1/app/security/pin`,
      cookie,
      body: { pin: "1357" },
    });
    status = await appOnboardingService.status(userId);
    expect(status.next_step).toBe("agreements");

    await acceptInvestDocuments(cookie);
    status = await appOnboardingService.status(userId);
    expect(status.complete).toBe(true);
    expect(status.next_step).toBeNull();
  });

  it("blocks money actions until setup is done", async () => {
    const { userId } = await signInCustomer("blocked@v3st.test");
    await expect(appOnboardingService.assertReady(userId, "add_money")).rejects.toMatchObject({
      code: "ONBOARDING_INCOMPLETE",
    });

    // The same failure through a customer route is customer copy.
    const route = withMiddleware<null, null, null>(
      async () => {
        await appOnboardingService.assertReady(userId, "add_money");
        return new Response("unreachable");
      },
      [],
      { audience: "customer" },
    );
    const res = await callAppRoute(route, { method: "GET", url: `${ORIGIN}/api/v1/app/probe` });
    expect(res.status).toBe(409);
    expect(res.json).toMatchObject({ code: "SETUP_REQUIRED" });

    // Once identity and documents are accepted, add_money is ready but invest
    // still needs the PIN.
    const { cookie } = await signInCustomer("blocked@v3st.test");
    await callAppRoute(identityPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/identity`,
      cookie,
      body: { test_identity_id: "tunde_tier1" },
    });
    await acceptInvestDocuments(cookie);
    await appOnboardingService.assertReady(userId, "add_money");
    await expect(appOnboardingService.assertReady(userId, "invest")).rejects.toMatchObject({
      code: "ONBOARDING_INCOMPLETE",
    });
    await expect(appOnboardingService.assertReady(userId, "withdraw")).rejects.toMatchObject({
      code: "ONBOARDING_INCOMPLETE",
    });
    await expect(appOnboardingService.assertReady(userId, "earn")).rejects.toMatchObject({
      code: "ONBOARDING_INCOMPLETE",
    });
  });

  it("rejects a stale document version", async () => {
    const { cookie } = await signInCustomer("stale@v3st.test");
    const res = await callAppRoute(agreementsPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/agreements`,
      cookie,
      body: { documents: [{ slug: "terms", version: "2026-01-01" }] },
    });
    expect(res.status).toBe(409);
    expect((res.json as { code: string }).code).toBe("DOCUMENT_UPDATED");
    expect(await db.agreementAcceptance.count()).toBe(0);
  });

  it("serves documents with their required statements", async () => {
    const list = await callAppRoute(documentsGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/documents`,
      cookie: (await signInCustomer("docs@v3st.test")).cookie,
    });
    expect(list.status).toBe(200);
    const listed = (list.json as { data: { slug: string; accepted: boolean }[] }).data;
    expect(listed).toHaveLength(5);
    expect(listed.every((d) => d.accepted === false)).toBe(true);

    for (const doc of Object.values(CUSTOMER_DOCUMENTS)) {
      const res = await callAppRoute(documentGET, {
        method: "GET",
        url: `${ORIGIN}/api/v1/app/documents/${doc.slug}`,
        params: { slug: doc.slug },
        documents: true,
      });
      expect(res.status).toBe(200);
      const body = (res.json as { data: { body: string; version: string; slug: string } }).data;
      expect(body.slug).toBe(doc.slug);
      expect(body.version).toBe("2026-11-17");
      for (const phrase of REQUIRED_PHRASES[doc.slug]) {
        expect(body.body.toLowerCase()).toContain(phrase.toLowerCase());
      }
    }
  });

  it("prepares the execution account in the background after a verified identity", async () => {
    const { cookie, userId } = await signInCustomer("prepare@v3st.test");
    const res = await callAppRoute(identityPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/identity`,
      cookie,
      body: { test_identity_id: "ada_tier2" },
    });
    expect((res.json as { data: { verified: boolean } }).data.verified).toBe(true);
    const job = await db.job.findFirst({
      where: { kind: "wallets.prepare_execution", subjectId: userId },
    });
    expect(job).not.toBeNull();

    const rejectedCookie = (await signInCustomer("rejected@v3st.test")).cookie;
    const rejectedRes = await callAppRoute(identityPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/identity`,
      cookie: rejectedCookie,
      body: { test_identity_id: "rejected" },
    });
    expect((rejectedRes.json as { data: { verified: boolean } }).data.verified).toBe(false);
    const rejectedUser = await db.user.findUniqueOrThrow({ where: { email: "rejected@v3st.test" } });
    const rejectedJob = await db.job.findFirst({
      where: { kind: "wallets.prepare_execution", subjectId: rejectedUser.id },
    });
    expect(rejectedJob).toBeNull();
  });

  it("lists the test identities", async () => {
    const { cookie } = await signInCustomer("menu@v3st.test");
    const res = await callAppRoute(testIdentitiesGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/identity/test-identities`,
      cookie,
    });
    expect(res.status).toBe(200);
    const items = (res.json as { data: { id: string; name: string; description: string }[] }).data;
    expect(items.map((i) => i.id)).toEqual(["ada_tier2", "tunde_tier1", "rejected"]);
    expect(items[0]!.name).toBe("ADAEZE OBI");
    expect(items[2]!.name).toBe("Not verified");
  });
});
