"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import type { AppAutomationDto, AppBankDto, AppProfileDto } from "@/types/app";
import type { PrivyMode } from "@/types/app-ui";
import type { SettingsModal } from "@/utils/app-paths";
import { BetaLine } from "@/components/app/beta-line";
import { useSignOut } from "@/components/app/signin/use-sign-out";
import { DocumentDialog } from "@/components/app/documents/document-dialog";
import { formatLagosDay } from "@/utils/format";
import type { AppDocumentSummaryDto } from "@/types/app";
import { Badge, Button } from "@/primitives";
import { automationLine, identityLine } from "./settings";
import { AutomationsDialog } from "./automations-dialog";
import { BankDialog } from "./bank-dialog";
import { ChangePinDialog } from "./change-pin-dialog";
import { DevicesDialog } from "./devices-dialog";
import { NameDialog } from "./name-dialog";
import { ResetPinDialog } from "./reset-pin-dialog";

// Settings: one modal at a time, each linked by ?open=<name>.
export function SettingsPage({
  profile,
  automations,
  documents,
  banks,
  open,
  privy,
}: {
  profile: AppProfileDto;
  automations: AppAutomationDto[];
  documents: AppDocumentSummaryDto[];
  banks: AppBankDto[];
  open: SettingsModal | null;
  privy: { mode: PrivyMode; appId: string | null };
}) {
  const router = useRouter();
  const [modal, setModal] = React.useState<SettingsModal | null>(open);
  const [documentSlug, setDocumentSlug] = React.useState<string | null>(null);
  const { signOut } = useSignOut();

  const fromUrl = React.useRef(open !== null);

  function onModalChange(next: boolean) {
    if (!next) {
      setModal(null);
      if (fromUrl.current) {
        router.replace("/settings");
        fromUrl.current = false;
      }
    }
  }

  const openModal = (name: SettingsModal) => {
    fromUrl.current = false;
    setModal(name);
  };

  const anyRenewal = automations.some((automation) => automation.needs_renewal);

  return (
    <div className="flex flex-col gap-6 pt-4">
      <h1 className="type-app-title text-heading">Settings</h1>

      <section aria-label="Profile" className="flex flex-col gap-2 rounded-2xl border border-stroke bg-surface p-5">
        <p className="text-heading text-[15px] font-medium">
          {profile.preferred_name ?? profile.first_name}
        </p>
        <p className="text-muted-foreground text-sm">{profile.email}</p>
        <p className="text-muted-foreground text-sm">{identityLine(profile)}</p>
        <Button variant="link" size="sm" className="self-start px-0" onClick={() => openModal("name")}>
          Change name
        </Button>
      </section>

      <section
        aria-label="Bank account"
        className="flex flex-col gap-2 rounded-2xl border border-stroke bg-surface p-5"
      >
        <p className="text-ink text-[15px]">
          {profile.bank_account === null
            ? "No bank account yet"
            : `${profile.bank_account.bank_name} ••${profile.bank_account.account_ending} · ${profile.bank_account.account_name}`}
        </p>
        <Button
          variant="link"
          size="sm"
          className="self-start px-0"
          onClick={() => openModal("bank")}
        >
          {profile.bank_account === null ? "Add a bank account" : "Change bank account"}
        </Button>
      </section>

      <section aria-label="Security" className="flex flex-col gap-1 rounded-2xl border border-stroke bg-surface p-5">
        <p className="text-heading text-[15px] font-medium">Security</p>
        <Button variant="link" size="sm" className="justify-start px-0" onClick={() => openModal("pin")}>
          Change PIN
        </Button>
        <Button
          variant="link"
          size="sm"
          className="justify-start px-0"
          onClick={() => openModal("reset-pin")}
        >
          Forgot your PIN?
        </Button>
        <Button
          variant="link"
          size="sm"
          className="justify-start px-0"
          onClick={() => openModal("devices")}
        >
          Devices
        </Button>
      </section>

      <section
        aria-label="Automatic actions"
        className="flex flex-col gap-2 rounded-2xl border border-stroke bg-surface p-5"
      >
        <p className="text-heading flex items-center gap-2 text-[15px] font-medium">
          Automatic actions
          {anyRenewal && <Badge variant="secondary">Needs renewal</Badge>}
        </p>
        <p className="text-muted-foreground text-sm">
          {automations.length === 0 ? "No automatic actions yet." : `${automations.length} on your account`}
        </p>
        {automations.length > 0 && (
          <ul className="flex flex-col gap-1">
            {automations.map((automation) => (
              <li key={automation.id} className="text-muted-foreground text-sm">
                {automation.title} · {automationLine(automation)} · until{" "}
                {formatLagosDay(automation.expires_at)}
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="link"
          size="sm"
          className="self-start px-0"
          onClick={() => openModal("automations")}
        >
          Manage
        </Button>
      </section>

      <section aria-label="Documents" className="flex flex-col gap-1 rounded-2xl border border-stroke bg-surface p-5">
        <p className="text-heading text-[15px] font-medium">Documents</p>
        {documents.map((doc) => (
          <button
            key={doc.slug}
            type="button"
            className="text-muted-foreground hover:text-heading flex min-h-11 items-center justify-between gap-3 text-left text-sm transition-colors"
            onClick={() => setDocumentSlug(doc.slug)}
          >
            <span>{doc.title}</span>
            <span className="text-subtle">Version {doc.version}</span>
          </button>
        ))}
      </section>

      <div className="flex flex-col gap-3">
        <Button variant="outline" onClick={() => void signOut()}>
          Sign out
        </Button>
        <BetaLine />
      </div>

      {modal === "name" && (
        <NameDialog open onOpenChange={onModalChange} profile={profile} />
      )}
      {modal === "bank" && <BankDialog open onOpenChange={onModalChange} banks={banks} />}
      {modal === "pin" && <ChangePinDialog open onOpenChange={onModalChange} />}
      {modal === "reset-pin" && (
        <ResetPinDialog
          open
          onOpenChange={onModalChange}
          email={profile.email}
          mode={privy.mode}
          appId={privy.appId}
        />
      )}
      {modal === "devices" && <DevicesDialog open onOpenChange={onModalChange} />}
      {modal === "automations" && (
        <AutomationsDialog open onOpenChange={onModalChange} initial={automations} />
      )}
      {documentSlug !== null && (
        <DocumentDialog
          slug={documentSlug as AppDocumentSummaryDto["slug"]}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setDocumentSlug(null);
          }}
        />
      )}
    </div>
  );
}
