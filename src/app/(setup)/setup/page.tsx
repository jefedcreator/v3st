import type { Metadata } from "next";

import { INVEST_DOCUMENTS } from "@/backend/content/documents";
import { AppError } from "@/components/app/app-error";
import { SetupFlow } from "@/components/app/setup/setup-flow";
import {
  readBanks,
  readDocuments,
  readOnboarding,
  readTestIdentities,
} from "@/server/app/reads";
import { requireCustomer } from "@/server/app/session";
import type { AppDocumentSlug } from "@/types/app";

export const metadata: Metadata = {
  title: "Setup · V3ST",
};

export default async function SetupPage() {
  const user = await requireCustomer("/setup");
  const [onboarding, testIdentities, documents, banks] = await Promise.all([
    readOnboarding(user),
    readTestIdentities(user),
    readDocuments(user),
    readBanks(user),
  ]);
  if (onboarding === null || testIdentities === null || documents === null || banks === null) {
    return <AppError />;
  }
  return (
    <SetupFlow
      onboarding={onboarding}
      testIdentities={testIdentities}
      documents={documents}
      banks={banks}
      investDocuments={INVEST_DOCUMENTS as AppDocumentSlug[] as string[]}
    />
  );
}
