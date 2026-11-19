"use client";

import * as React from "react";
import { cn } from "@/utils/cn";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "grid size-5 shrink-0 place-content-center rounded-[4px] border border-input bg-transparent transition-[border-color,background-color] outline-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-3",
        "data-[state=checked]:border-signal data-[state=checked]:bg-signal data-[state=checked]:text-white",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <Check className="size-3.5" weight="bold" aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
