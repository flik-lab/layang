"use client";

import { forwardRef, type CSSProperties, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role"> {
  onCheckedChange?: (checked: boolean) => void;
  loading?: boolean;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { className, loading = false, onChange, onCheckedChange, style, ...props },
  ref,
) {
  const fixedSizeStyle: CSSProperties = {
    ...style,
    width: 44,
    height: 24,
    minWidth: 44,
    minHeight: 24,
    maxWidth: 44,
    maxHeight: 24,
  };

  return (
    <span
      data-slot="switch-wrapper"
      data-loading={loading ? "true" : "false"}
      className={cn("relative inline-flex h-6 w-11 shrink-0 self-center align-middle", loading && "pointer-events-none")}
    >
      <input
        ref={ref}
        data-slot="switch"
        type="checkbox"
        role="switch"
        aria-checked={props.checked ?? props.defaultChecked ?? false}
        onChange={(event) => {
          event.currentTarget.setAttribute("aria-checked", String(event.currentTarget.checked));
          onChange?.(event);
          onCheckedChange?.(event.currentTarget.checked);
        }}
        className={cn(
          "peer m-0 h-6 w-11 shrink-0 appearance-none rounded-full border border-border/70 bg-muted-foreground/30 shadow-sm outline-none transition-colors hover:border-border checked:border-primary/70 checked:bg-primary disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          className,
        )}
        style={fixedSizeStyle}
        {...props}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5 peer-disabled:bg-muted-foreground/50"
      >
        {loading ? <span className="size-2 animate-pulse rounded-full bg-primary" /> : null}
      </span>
    </span>
  );
});
