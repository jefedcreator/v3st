import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";
import { Slot } from "radix-ui";

const buttonVariants = cva(
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full text-[15px] font-semibold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-signal text-primary-foreground hover:bg-signal-hover",
        outline:
          "border border-control-border bg-transparent text-heading hover:bg-surface-raised",
        secondary: "bg-surface-raised text-ink hover:bg-surface",
        ghost: "hover:bg-surface-raised hover:text-heading",
        link: "text-gain underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 py-3",
        xs: "h-11 gap-1 px-3 text-xs",
        sm: "h-11 gap-2 px-4",
        lg: "h-12 px-7 text-base",
        icon: "size-11",
        "icon-xs": "size-11",
        "icon-sm": "size-11",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
