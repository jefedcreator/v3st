import type { Metadata } from "next";

import { env } from "@/env";
import { AppError } from "@/components/app/app-error";
import { SettingsPage } from "@/components/app/settings/settings-page";
import { parseSettingsOpen } from "@/utils/app-paths";

import { readSettings, readBanks } from "@/server/app/reads";
import { requireCustomer } from "@/server/app/session";
import type { PrivyMode } from "@/types/app-ui";

export const metadata: Metadata = {
  title: "Settings · V3ST",
};

export default async function SettingsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string | string[] }>;
}) {
  const params = await searchParams;
  const user = await requireCustomer("/settings");
  const [read, banks] = await Promise.all([readSettings(user), readBanks(user)]);
  if (read === null || banks === null) return <AppError />;
  return (
    <SettingsPage
      profile={read.profile}
      automations={read.automations}
      documents={read.documents}
      banks={banks}
      open={parseSettingsOpen(params.open)}
      privy={{ mode: env.PRIVY_MODE, appId: env.PRIVY_APP_ID ?? null }}
    />
  );
}
