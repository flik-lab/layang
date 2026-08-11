"use client";

import { Check, Minus } from "lucide-react";
import { forwardRef, useEffect, useRef, type CSSProperties, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, indeterminate = false, onChange, onCheckedChange, checked, style, ...props },
  forwardedRef,
) {
  const localRef = useRef<HTMLInputElement | null>(null);
  const fixedSizeStyle: CSSProperties = {
    ...style,
    width: 18,
    height: 18,
    minWidth: 18,
    minHeight: 18,
    maxWidth: 18,
    maxHeight: 18,
  };

  useEffect(() => {
    if (localRef.current) localRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <span data-slot="checkbox-wrapper" className="relative inline-flex size-[18px] shrink-0 self-center align-middle">
      <input
        ref={(node) => {
          localRef.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        data-slot="checkbox"
        type="checkbox"
        checked={checked}
        aria-checked={indeterminate ? "mixed" : checked}
        onChange={(event) => {
          onChange?.(event);
          onCheckedChange?.(event.currentTarget.checked);
        }}
        className={cn(
          "peer m-0 size-[18px] shrink-0 appearance-none rounded-[4px] border border-border/80 bg-background shadow-sm hover:border-primary/60 outline-none transition-colors checked:border-primary checked:bg-primary disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          className,
        )}
        style={fixedSizeStyle}
        {...props}
      />
      <Check
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 size-[18px] p-[2px] text-primary-foreground opacity-0 peer-checked:opacity-100",
          indeterminate && "hidden",
        )}
      />
      {indeterminate ? (
        <Minus
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-[18px] p-[2px] text-primary-foreground"
        />
      ) : null}
    </span>
  );
});
