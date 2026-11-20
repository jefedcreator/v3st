"use client";

import Link from "next/link";
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
import { Check } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/utils/cn";
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
        <h1 className="type-app-title text-heading">You&apos;re all set</h1>
        <p className="text-muted-foreground">Add money to make your first investment.</p>
        <Button asChild>
          <Link
            href="/home"
            onClick={() => {
              void queryClient.invalidateQueries();
            }}
          >
            Go to home
          </Link>
        </Button>
      </div>
    );
  }

  const requiredDocs = documents.filter((doc) => investDocuments.includes(doc.slug));

  return (
    <div className="flex flex-col gap-8 md:grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-12">
      <nav aria-label="Setup steps" className="hidden md:block">
        <ol className="flex flex-col gap-1">
          {onboarding.steps.map((step) => {
            const isCurrent = step.key === current.key;
            return (
              <li
                key={step.key}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 text-[15px]",
                  isCurrent ? "text-heading font-medium" : "text-subtle",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full",
                    step.done ? "bg-signal text-white" : "border-control-border border",
                    isCurrent && "border-gain",
                  )}
                >
                  {step.done ? <Check className="size-3" weight="bold" /> : null}
                </span>
                {step.title}
                {step.done ? <span className="sr-only">, done</span> : null}
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-3" aria-live="polite">
          <h1 className="type-app-title text-heading">{current.title}</h1>
          <div className="flex items-center gap-3 md:hidden">
            <span aria-hidden="true" className="flex flex-1 gap-1">
              {onboarding.steps.map((step, stepIndex) => (
                <span
                  key={step.key}
                  className={cn("h-0.5 flex-1 rounded-full", stepIndex <= index ? "bg-signal" : "bg-stroke")}
                />
              ))}
            </span>
            <span className="text-subtle shrink-0 text-[13px] tabular-nums">
              Step {index + 1} of {total}
            </span>
          </div>
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
    </div>
  );
}
