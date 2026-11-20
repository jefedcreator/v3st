"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/utils/cn";
import { crossingId, type LineItem, type LineTone } from "./line-model";

const HALO = "shadow-[0_0_0_4px_rgb(61_220_151/0.14)]";

// The node on the spine for each tone (spec §Home: Nodes).
function nodeFor(tone: LineTone): string {
  switch (tone) {
    case "waiting":
      return cn("border-gain bg-void border-2", HALO);
    case "processing":
      return cn("border-gain bg-void border-2 motion-safe:animate-pulse", HALO);
    case "action":
      return "border-heading bg-void border-2";
    case "done":
      return "border-signal bg-signal border-2";
    case "failed":
      return "border-loss bg-void border-2";
    case "ended":
      return "border-subtle bg-void border-2";
  }
}

// What the node says to a screen reader.
const TONE_LABEL: Record<LineTone, string | null> = {
  waiting: "Waiting",
  processing: "Processing",
  action: null,
  done: null,
  failed: "Didn't go through",
  ended: "Cancelled",
};

// One row of the money line. Its node sits on the spine in the 44px gutter;
// the row itself is the link. Moving between Coming up and Earlier, the row
// slides across Now (240ms); under reduced motion it fades in (200ms).
export function LineRow({ item }: { item: LineItem }) {
  const reduced = useReducedMotion();
  const toneLabel = TONE_LABEL[item.tone];
  const row = (
    <Link
      href={item.href}
      className="group focus-visible:outline-ring relative flex min-h-11 flex-col gap-0.5 border-b border-stroke py-3 focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "min-w-0 text-[15px] font-medium break-words transition-colors",
            item.tone === "failed" ? "text-loss" : "text-heading group-hover:text-gain",
          )}
        >
          {item.title}
          {toneLabel !== null && <span className="sr-only">, {toneLabel}</span>}
        </span>
        {item.amountText !== null && (
          <span className="text-ink shrink-0 text-[15px] tabular-nums">{item.amountText}</span>
        )}
        {item.amountText === null && item.tone === "action" && (
          <span className="text-gain shrink-0 text-[13px] font-semibold">Needs you</span>
        )}
      </span>
      {item.detail !== "" && (
        <span className="text-muted-foreground text-[13px] break-words">{item.detail}</span>
      )}
      <span
        aria-hidden="true"
        className={cn("absolute top-4 left-[-36px] size-3 rounded-full", nodeFor(item.tone))}
      />
    </Link>
  );
  if (reduced) {
    return (
      <motion.li initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
        {row}
      </motion.li>
    );
  }
  return (
    <motion.li
      layout="position"
      layoutId={crossingId(item.key)}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      {row}
    </motion.li>
  );
}
