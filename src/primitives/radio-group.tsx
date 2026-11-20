"use client";

import * as React from "react";
import { cn } from "@/utils/cn";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "grid size-5 shrink-0 place-content-center rounded-full border border-input bg-transparent transition-[border-color] outline-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-3",
        "data-[state=checked]:border-signal data-[state=checked]:bg-signal",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <Check className="size-3.5 text-white" weight="bold" aria-hidden="true" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
