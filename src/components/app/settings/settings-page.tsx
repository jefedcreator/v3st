"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";

import type {
  AppAutomationDto,
  AppBankDto,
  AppDocumentSlug,
  AppDocumentSummaryDto,
  AppProfileDto,
} from "@/types/app";
import type { PrivyMode } from "@/types/app-ui";
import type { SettingsModal } from "@/utils/app-paths";
import { BetaLine } from "@/components/app/beta-line";
import { useSignOut } from "@/components/app/signin/use-sign-out";
import { DocumentDialog } from "@/components/app/documents/document-dialog";
import { useAutomationsQuery, useProfileQuery } from "@/hooks/app/use-settings";
import { Badge, Button } from "@/primitives";
import { identityLine } from "./settings";
import { AutomationsDialog } from "./automations-dialog";
import { BankDialog } from "./bank-dialog";
import { ChangePinDialog } from "./change-pin-dialog";
import { DevicesDialog } from "./devices-dialog";
import { NameDialog } from "./name-dialog";
import { ResetPinDialog } from "./reset-pin-dialog";

// One settings row: a 44px+ button that opens its modal.
function Row({
  label,
  value,
  badge,
  onClick,
}: {
  label: string;
  value?: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <li className="border-b border-stroke last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        className="group focus-visible:outline-ring flex min-h-12 w-full items-center gap-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-heading group-hover:text-gain text-[15px] transition-colors">
            {label}
          </span>
          {value !== undefined && (
            <span className="text-muted-foreground text-sm break-words">{value}</span>
          )}
        </span>
        {badge !== undefined && (
          <Badge variant="secondary" className="shrink-0">
            {badge}
          </Badge>
        )}
        <CaretRight className="text-subtle size-4 shrink-0" aria-hidden="true" />
      </button>
    </li>
  );
}

// A settings group: a card with a heading and hairline rows, never nested.
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `settings-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col rounded-2xl border border-stroke bg-surface px-5 pt-4 pb-1"
    >
      <h2 id={id} className="text-muted-foreground text-[13px] font-medium">
        {title}
      </h2>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

// Settings: one modal at a time, each linked by ?open=<name>.
export function SettingsPage({
  profile: initialProfile,
  automations: initialAutomations,
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
  const { data: profile } = useProfileQuery(initialProfile);
  const { data: automations } = useAutomationsQuery(initialAutomations);
  const [modal, setModal] = React.useState<SettingsModal | null>(open);
  const [documentSlug, setDocumentSlug] = React.useState<AppDocumentSlug | null>(null);
  const { signOut, pending: signingOut } = useSignOut();
  const fromUrl = React.useRef(open !== null);

  // A backend link can open a modal while the page is already mounted.
  React.useEffect(() => {
    if (open !== null) {
      setModal(open);
      fromUrl.current = true;
    }
  }, [open]);

  function onModalChange(next: boolean) {
    if (next) return;
    setModal(null);
    if (fromUrl.current) {
      fromUrl.current = false;
      router.replace("/settings", { scroll: false });
    }
  }

  function openModal(name: SettingsModal) {
    fromUrl.current = false;
    setModal(name);
  }

  const needsRenewal = automations.some((automation) => automation.needs_renewal);
  const activeCount = automations.filter((automation) => automation.active).length;
  const bank = profile.bank_account;

  return (
    <div className="flex flex-col gap-6 pt-4">
      <h1 className="type-app-title text-heading">Settings</h1>

      <Group title="Profile">
        <Row
          label="Change name"
          value={[profile.preferred_name ?? profile.first_name, profile.email, identityLine(profile)]
            .filter((part): part is string => part !== null && part !== "")
            .join(" · ")}
          onClick={() => openModal("name")}
        />
      </Group>

      <Group title="Bank account">
        <Row
          label={bank === null ? "Add a bank account" : "Change bank account"}
          value={
            bank === null
              ? "No bank account yet"
              : `${bank.bank_name} ••${bank.account_ending} · ${bank.account_name}`
          }
          onClick={() => openModal("bank")}
        />
      </Group>

      <Group title="Security">
        <Row label="Change PIN" onClick={() => openModal("pin")} />
        <Row label="Forgot your PIN?" onClick={() => openModal("reset-pin")} />
        <Row label="Devices" onClick={() => openModal("devices")} />
      </Group>

      <Group title="Automatic actions">
        <Row
          label="Automatic actions"
          value={activeCount === 0 ? "None on yet" : `${activeCount} active`}
          badge={needsRenewal ? "Needs renewal" : undefined}
          onClick={() => openModal("automations")}
        />
      </Group>

      <Group title="Documents">
        {documents.map((doc) => (
          <Row
            key={doc.slug}
            label={doc.title}
            value={`Version ${doc.version}`}
            onClick={() => setDocumentSlug(doc.slug)}
          />
        ))}
      </Group>

      <div className="flex flex-col items-start gap-3">
        <Button variant="outline" disabled={signingOut} onClick={() => void signOut()}>
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
        <BetaLine />
      </div>

      {modal === "name" && <NameDialog open onOpenChange={onModalChange} profile={profile} />}
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
          slug={documentSlug}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setDocumentSlug(null);
          }}
        />
      )}
    </div>
  );
}
