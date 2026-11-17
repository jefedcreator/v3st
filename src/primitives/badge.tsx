import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";
import { Slot } from "radix-ui";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border border-transparent px-3 py-1.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "border-white/20 text-[11px] font-medium tracking-[0.16em] text-white/80 uppercase [a&]:hover:bg-white/5",
        secondary: "bg-surface-raised text-ink [a&]:hover:bg-surface",
        outline:
          "border-stroke text-ink [a&]:hover:bg-surface-raised [a&]:hover:text-heading",
        ghost: "[a&]:hover:bg-surface-raised [a&]:hover:text-heading",
        link: "text-gain underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
