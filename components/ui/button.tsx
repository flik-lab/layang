"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border text-[length:var(--font-size-control)] font-medium leading-none transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        destructive: "border-destructive bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "border-secondary bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "border-transparent bg-transparent hover:bg-accent hover:text-accent-foreground",
        link: "border-transparent bg-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[var(--control-height)] px-3",
        xs: "h-6 rounded-sm px-2 text-[length:var(--font-size-caption)]",
        sm: "h-[var(--control-height-sm)] px-2.5",
        lg: "h-9 px-4 text-[length:var(--font-size-control)]",
        icon: "size-[var(--control-height)] p-0",
        "icon-xs": "size-6 rounded-sm p-0",
        "icon-sm": "size-[var(--control-height-sm)] p-0",
        "icon-lg": "size-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { asChild = false, className, variant, size, type, ...props },
  ref,
) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      type={asChild ? undefined : (type ?? "button")}
      {...props}
    />
  );
});
