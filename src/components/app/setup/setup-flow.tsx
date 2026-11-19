"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { appKeys } from "@/hooks/app/query-keys";
import type {
  AppBankDto,
  AppDocumentSummaryDto,
  AppOnboardingDto,
  AppTestIdentityDto,
} from "@/types/app";
import { Button } from "@/primitives";
import { setupProgress } from "./setup-steps";
import { BankStep } from "./bank-step";
import { DocumentsStep } from "./documents-step";
import { IdentityStep } from "./identity-step";
import { PinSetupStep } from "./pin-setup-step";

export function SetupFlow({
  onboarding,
  testIdentities,
  documents,
  banks,
  investDocuments,
}: {
  onboarding: AppOnboardingDto;
  testIdentities: AppTestIdentityDto[];
  documents: AppDocumentSummaryDto[];
  banks: AppBankDto[];
  investDocuments: string[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { current, index, total } = setupProgress(onboarding);

  const afterSuccess = () => {
    router.refresh();
    void queryClient.invalidateQueries({ queryKey: appKeys.onboarding });
    void queryClient.invalidateQueries({ queryKey: appKeys.session });
  };

  if (current === null) {
    return (
      <div className="flex flex-col items-start gap-4 pt-6" role="status" aria-live="polite">
        <h1 className="type-app-title text-heading">You're all set</h1>
        <p className="text-muted-foreground">Add money to make your first investment.</p>
        <Button
          onClick={() => {
            queryClient.clear();
            router.push("/home");
          }}
        >
          Go to home
        </Button>
      </div>
    );
  }

  const requiredDocs = documents.filter((doc) => investDocuments.includes(doc.slug));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2 md:hidden" aria-live="polite">
        <p className="text-subtle text-[13px]">
          Step {index + 1} of {total} · {current.title}
        </p>
        <h1 className="type-app-heading text-heading">{current.title}</h1>
      </div>
      <div className="hidden md:block" aria-hidden="true">
        <ol className="flex flex-col gap-2">
          {onboarding.steps.map((step, stepIndex) => (
            <li
              key={step.key}
              className={
                step.key === current.key
                  ? "text-heading text-[15px] font-medium"
                  : "text-subtle text-[15px]"
              }
            >
              {stepIndex + 1}. {step.title}
              {step.done ? " Done" : null}
            </li>
          ))}
        </ol>
      </div>
      {current.key === "identity" && (
        <IdentityStep identities={testIdentities} onDone={afterSuccess} />
      )}
      {current.key === "pin" && <PinSetupStep onDone={afterSuccess} />}
      {current.key === "agreements" && (
        <DocumentsStep documents={requiredDocs} onDone={afterSuccess} />
      )}
      {current.key === "bank_account" && <BankStep banks={banks} onDone={afterSuccess} />}
    </div>
  );
}
