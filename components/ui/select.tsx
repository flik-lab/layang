import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, containerClassName, children, ...props },
  ref,
) {
  return (
    <span data-slot="select-wrapper" className={cn("relative inline-flex w-full", containerClassName)}>
      <select
        ref={ref}
        data-slot="select"
        className={cn(
          "h-[var(--control-height)] w-full appearance-none rounded-md border border-input bg-background px-2.5 pr-8 text-[length:var(--font-size-control)] font-normal text-foreground shadow-sm outline-none transition-colors disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 aria-invalid:border-destructive aria-invalid:ring-destructive/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
});
