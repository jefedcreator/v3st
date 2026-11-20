"use client";

import Link from "next/link";
import { AnimatePresence } from "motion/react";

import type { MoneyLineModel } from "./line-model";
import { LineRow } from "./line-row";
import { NowMarker } from "./now-marker";

// The money line: a 2px signal spine in a 44px gutter, dashed above the Now
// marker and solid below it, with Coming up above and Earlier below.
export function MoneyLine({ model, complete }: { model: MoneyLineModel; complete: boolean }) {
  const empty = model.upcoming.length === 0 && model.earlier.length === 0;
  return (
    <section aria-labelledby="money-line-heading" className="flex flex-col">
      <h2 id="money-line-heading" className="sr-only">
        Your money
      </h2>
      <div className="relative pl-11">
        <span
          aria-hidden="true"
          className="border-signal absolute top-9 bottom-0 left-[13px] border-l-2 border-dashed"
        />
        <p className="text-muted-foreground pt-2.5 pb-1.5 text-[13px] font-medium">Coming up</p>
        <ul className="flex flex-col">
          <AnimatePresence initial={false}>
            {model.upcoming.map((item) => (
              <LineRow key={item.key} item={item} />
            ))}
          </AnimatePresence>
        </ul>
        {/* What comes next sits above Now; the Add money pill is right above. */}
        {empty && complete && (
          <p className="text-muted-foreground pb-3 text-sm">Add money to get started.</p>
        )}
      </div>
      <NowMarker />
      <div className="relative pl-11">
        <span aria-hidden="true" className="bg-signal absolute top-0 bottom-0 left-[13px] w-0.5" />
        <p className="text-muted-foreground pt-2.5 pb-1.5 text-[13px] font-medium">Earlier</p>
        <ul className="flex flex-col">
          <AnimatePresence initial={false}>
            {model.earlier.map((item) => (
              <LineRow key={item.key} item={item} />
            ))}
          </AnimatePresence>
        </ul>
        {model.earlier.length === 0 && (
          <p className="text-muted-foreground pb-3 text-sm">Your first transfer will show up here.</p>
        )}
      </div>
      <p className="pl-11">
        <Link
          href="/activity"
          className="text-gain inline-flex min-h-11 items-center text-sm font-semibold underline-offset-4 hover:underline"
        >
          See all activity
        </Link>
      </p>
    </section>
  );
}
