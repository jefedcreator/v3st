"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/utils/cn";
import type { LineItem, LineTone } from "./line-model";

function nodeFor(tone: LineTone): string {
  switch (tone) {
    case "processing":
    case "waiting":
      return "border-gain bg-surface size-3.5 border-2 shadow-[0_0_0_4px_rgb(61_220_151/0.14)]";
    case "action":
      return "border-heading bg-surface size-3.5 border-2 shadow-[0_0_0_4px_rgb(61_220_151/0.14)]";
    case "done":
      return "bg-signal size-3.5";
    case "failed":
      return "border-loss bg-surface size-3.5 border-2";
    case "ended":
      return "border-subtle bg-surface size-3.5 border-2";
  }
}

// One row of the money line, animating across the marker when it moves group.
export function LineRow({ item }: { item: LineItem }) {
  const reduced = useReducedMotion();
  const node = nodeFor(item.tone);
  const row = (
    <Link
      href={item.href}
      className="relative flex min-h-11 items-center justify-between gap-4 py-3 pl-1 transition-colors last:border-b-0 hover:bg-surface"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "text-[15px]",
            item.tone === "failed" ? "text-loss" : "text-ink",
          )}
        >
          {item.title}
        </span>
        <span className="text-muted-foreground text-sm">{item.detail}</span>
      </span>
      {item.amountText !== null && (
        <span className="text-ink shrink-0 text-[15px] tabular-nums">{item.amountText}</span>
      )}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 -left-[9px] -translate-y-1/2 rounded-full",
          node,
          item.tone === "processing" && "motion-safe:animate-pulse",
        )}
      />
    </Link>
  );
  if (reduced) {
    return <motion.div layout={false}>{row}</motion.div>;
  }
  return <motion.div layout layoutId={item.key} transition={{ duration: 0.24, ease: "easeOut" }}>{row}</motion.div>;
}
