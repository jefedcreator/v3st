"use client";

import * as React from "react";
import { cn } from "@/utils/cn";
import { Check, Copy } from "@phosphor-icons/react/dist/ssr";

// Copies its value and announces "Copied" politely for two seconds.
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  async function onClick() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "text-muted-foreground hover:text-heading inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm transition-colors",
        "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-3",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
