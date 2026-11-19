"use client";

import * as React from "react";

import { formatNaira } from "@/utils/format";
import type { AppPayToDto } from "@/types/app";
import { BetaLine } from "@/components/app/beta-line";
import { Button, CopyButton } from "@/primitives";
import { useCountdown } from "./use-countdown";

// The bank details of an unpaid transfer, on a card, with its countdown and
// the beta affordance that marks the test transfer paid.
export function TransferCard({
  payTo,
  onCompleteBeta,
}: {
  payTo: AppPayToDto;
  onCompleteBeta: () => Promise<void>;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const countdownState = useCountdown(payTo.expires_at);

  async function onComplete() {
    setPending(true);
    setError(null);
    try {
      await onCompleteBeta();
    } catch {
      setError("That didn't go through. Try again.");
    }
    setPending(false);
  }

  return (
    <div className="card flex flex-col gap-4 rounded-2xl border border-stroke bg-surface-raised p-5">
      <p className="text-ink text-[15px] font-medium">
        Send exactly {formatNaira(payTo.amount_kobo)} to
      </p>
      <dl className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground text-sm">Bank</dt>
          <dd className="text-ink text-right text-sm">{payTo.bank_name}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground text-sm">Account number</dt>
          <dd className="text-ink flex items-center gap-1 text-right text-sm tabular-nums">
            {payTo.account_number}
            <CopyButton value={payTo.account_number} label="Copy account number" />
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground text-sm">Account name</dt>
          <dd className="text-ink text-right text-sm">{payTo.account_name}</dd>
        </div>
        {payTo.reference !== null && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground text-sm">Reference</dt>
            <dd className="text-ink flex items-center gap-1 text-right text-sm">
              {payTo.reference}
              <CopyButton value={payTo.reference} label="Copy reference" />
            </dd>
          </div>
        )}
      </dl>
      {countdownState !== null && (
        <p role="status" aria-live="polite" className="text-muted-foreground text-sm" suppressHydrationWarning>
          {countdownState.done
            ? "This transfer window has closed."
            : `Waiting for your transfer · ${countdownState.text} left`}
        </p>
      )}
      <Button variant="outline" onClick={() => void onComplete()} disabled={pending}>
        {pending ? "Marking…" : "Complete this test transfer"}
      </Button>
      <BetaLine notice="Beta: this marks your test transfer as paid." />
      {error !== null && (
        <p role="status" aria-live="polite" className="text-loss text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
