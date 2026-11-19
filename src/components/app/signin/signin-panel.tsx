"use client";

import dynamic from "next/dynamic";
import * as React from "react";

import { BetaLine } from "@/components/app/beta-line";
import { AppSkeleton } from "@/components/app/app-skeleton";
import type { PrivyMode } from "@/types/app-ui";
import { SimulatedSignin } from "./simulated-signin";

const PrivySignin = dynamic(() => import("./privy-signin"), {
  ssr: false,
  loading: () => <AppSkeleton variant="form" />,
});

export function SigninPanel({
  mode,
  appId,
  next,
  signedOut,
}: {
  mode: PrivyMode;
  appId: string | null;
  next: string | null;
  signedOut: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="type-app-title text-heading">Sign in to V3ST</h1>
        <p className="text-muted-foreground text-[15px]">Use the email you were invited with.</p>
      </div>
      {signedOut && (
        <p role="status" aria-live="polite" className="text-gain text-sm">
          You&apos;re signed out.
        </p>
      )}
      {mode === "simulated" && <SimulatedSignin next={next} />}
      {mode === "sandbox" && appId === null && (
        <p className="text-muted-foreground text-sm">Sign-in isn&apos;t set up on this server yet.</p>
      )}
      {mode === "sandbox" && appId !== null && (
        <PrivySignin appId={appId} next={next} signedOut={signedOut} />
      )}
      <BetaLine />
    </div>
  );
}
