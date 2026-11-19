"use client";

import * as React from "react";

import type { AppEarnProductDto } from "@/types/app";
import { formatLagosDay, formatNaira } from "@/utils/format";
import { PageHeader } from "@/components/app/page-header";
import { DocumentDialog } from "@/components/app/documents/document-dialog";
import { SetupGate } from "@/components/app/setup-gate";
import { Badge, Button, KeyValue, Money } from "@/primitives";
import { useEarnProductQuery } from "@/hooks/app/use-earn";
import { positionView } from "./earn";
import { JoinEarnDialog } from "./join-earn-dialog";
import { LeaveEarnDialog } from "./leave-earn-dialog";

// Understand one Earn product, and join or leave it.
export function EarnProductPage({ product: initial }: { product: AppEarnProductDto }) {
  const { data: product } = useEarnProductQuery(initial.id, initial);
  const [risksOpen, setRisksOpen] = React.useState(false);
  const [joinOpen, setJoinOpen] = React.useState(false);
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const view = positionView(product.position, product.available);

  return (
    <div className="flex flex-col gap-6 pt-4">
      <PageHeader title={product.title} back={{ href: "/earn", label: "Earn" }} />
      <p className="text-muted-foreground text-[15px]">{product.summary}</p>
      <section aria-label="How it works" className="flex flex-col gap-2">
        <h2 className="type-app-heading text-heading">How it works</h2>
        {product.how_it_works.map((line) => (
          <p key={line} className="text-muted-foreground text-sm">
            {line}
          </p>
        ))}
      </section>
      <section aria-label="Risks" className="flex flex-col gap-2">
        <h2 className="type-app-heading text-heading">Risks</h2>
        {product.risks.map((line) => (
          <p key={line} className="text-muted-foreground text-sm">
            {line}
          </p>
        ))}
        <p>
          <button
            type="button"
            className="text-gain text-[15px] underline-offset-4 hover:underline"
            onClick={() => setRisksOpen(true)}
          >
            Read the full Earn risks
          </button>
        </p>
      </section>
      <p className="text-muted-foreground text-sm">
        You add from {formatNaira(product.minimum_kobo)}.
      </p>
      {product.position !== null && (
        <section aria-label="Your position" className="flex flex-col gap-2 rounded-2xl border border-stroke bg-surface p-5">
          <KeyValue>
            {[
              { label: "Added", value: <Money kobo={product.position.added_kobo} /> },
              { label: "Value", value: <Money kobo={product.position.value_kobo} /> },
              { label: "Earned", value: <Money kobo={product.position.earned_kobo} /> },
              {
                label: "Joined",
                value: formatLagosDay(product.position.joined_at),
              },
            ]}
          </KeyValue>
        </section>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {view.statusText !== null && <Badge variant="secondary">{view.statusText}</Badge>}
        {view.canJoin && (
          <SetupGate label="Finish setting up to earn">
            <Button onClick={() => setJoinOpen(true)}>Join</Button>
          </SetupGate>
        )}
        {view.canLeave && (
          <Button variant="outline" onClick={() => setLeaveOpen(true)}>
            Withdraw
          </Button>
        )}
      </div>
      <DocumentDialog
        slug="earn-risks"
        open={risksOpen}
        onOpenChange={setRisksOpen}
      />
      {joinOpen && (
        <JoinEarnDialog
          open={joinOpen}
          onOpenChange={(open) => {
            if (!open) setJoinOpen(false);
          }}
          product={product}
        />
      )}
      {leaveOpen && product.position !== null && (
        <LeaveEarnDialog
          open={leaveOpen}
          onChange={setLeaveOpen}
          product={product}
        />
      )}
    </div>
  );
}
