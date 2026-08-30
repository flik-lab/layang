import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex h-[22px] min-h-[22px] max-w-full items-center rounded-full border px-2 text-[length:var(--font-size-caption)] font-medium leading-4 transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border bg-transparent text-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
        success: "border-success/40 bg-success/10 text-success-foreground",
        warning: "border-warning/40 bg-warning/10 text-warning-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
