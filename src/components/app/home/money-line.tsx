"use client";

import { motion } from "motion/react";

import type { MoneyLineModel } from "./line-model";
import { LineRow } from "./line-row";
import { NowMarker } from "./now-marker";

// The spine, the Coming up and Earlier groups, and the Now marker between
// them.
export function MoneyLine({ model, complete }: { model: MoneyLineModel; complete: boolean }) {
  const empty = model.upcoming.length === 0 && model.earlier.length === 0;
  return (
    <section aria-label="Your money" className="flex flex-col">
      <div className="border-stroke relative ml-2 flex flex-col border-l-2 border-dashed">
        <p className="text-muted-foreground relative z-10 -ml-0.5 pb-1 pl-[9px] text-[13px] font-medium">
          Coming up
        </p>
        <div className="relative z-10 flex w-full flex-col">
          {model.upcoming.map((item) => (
            <LineRow key={item.key} item={item} />
          ))}
          {model.upcoming.length === 0 && complete && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-muted-foreground pl-[9px] text-sm">
              Add money to get started.
            </motion.p>
          )}
        </div>
        <div className="bg-surface relative z-10 pl-0">
          <NowMarker />
        </div>
        <p className="text-muted-foreground relative z-10 pb-1 pl-[9px] text-[13px] font-medium">
          Earlier
        </p>
        <div className="relative z-10 flex w-full flex-col">
          {model.earlier.map((item) => (
            <LineRow key={item.key} item={item} />
          ))}
          {empty && (
            <p className="text-muted-foreground pl-[9px] text-sm">
              Your first transfer will show up here.
            </p>
          )}
          {model.earlier.length === 0 && !empty && model.upcoming.length > 0 && (
            <p className="text-muted-foreground pl-[9px] text-sm">
              Your first transfer will show up here.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
