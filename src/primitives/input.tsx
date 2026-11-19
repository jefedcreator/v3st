import * as React from "react";
import { cn } from "@/utils/cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-input bg-surface text-heading placeholder:text-subtle h-12 w-full min-w-0 rounded-md border px-4 text-base transition-[color,border-color] outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-loss",
        "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-3",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
