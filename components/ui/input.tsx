import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const inputClassName =
  "flex h-[var(--control-height)] w-full rounded-md border border-input bg-background px-2.5 text-[length:var(--font-size-control)] font-normal text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 aria-invalid:border-destructive aria-invalid:ring-destructive/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, type, ...props },
  ref,
) {
  return <input ref={ref} data-slot="input" type={type} className={cn(inputClassName, className)} {...props} />;
});
