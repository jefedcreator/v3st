import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { env } from "@/env";
import { ProductLogo } from "@/components/product-logo";
import { Badge } from "@/primitives";
import { SigninPanel } from "@/components/app/signin/signin-panel";
import { getCurrentCustomer } from "@/server/app/session";
import { safeNext } from "@/utils/app-paths";

export const metadata: Metadata = {
  title: "Sign in · V3ST",
};

export default async function SigninPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; "signed-out"?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? null;
  const user = await getCurrentCustomer();
  if (user !== null) {
    redirect(safeNext(next));
  }
  const signedOut = params["signed-out"] === "1";
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-2.5">
        <ProductLogo className="h-8 w-auto text-gain" />
        <Badge>Beta</Badge>
      </div>
      <SigninPanel
        mode={env.PRIVY_MODE}
        appId={env.PRIVY_APP_ID ?? null}
        next={next}
        signedOut={signedOut}
      />
    </div>
  );
}
