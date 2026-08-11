"use client";

import { Slot } from "@radix-ui/react-slot";
import { createContext, forwardRef, useContext, useId, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function TooltipProvider({ children }: { children: ReactNode; delayDuration?: number }) {
  return children;
}

type TooltipContextValue = {
  contentId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
};

const TooltipContext = createContext<TooltipContextValue | null>(null);

function useTooltipContext() {
  const context = useContext(TooltipContext);
  if (!context) throw new Error("Tooltip components must be used inside Tooltip");
  return context;
}

export function Tooltip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return (
    <TooltipContext.Provider value={{ contentId, open, setOpen }}>
      <span data-slot="tooltip" className="relative inline-flex">
        {children}
      </span>
    </TooltipContext.Provider>
  );
}

export interface TooltipTriggerProps extends HTMLAttributes<HTMLElement> {
  asChild?: boolean;
}

export const TooltipTrigger = forwardRef<HTMLElement, TooltipTriggerProps>(function TooltipTrigger(
  { asChild = true, onMouseEnter, onMouseLeave, onFocus, onBlur, ...props },
  ref,
) {
  const { contentId, setOpen } = useTooltipContext();
  const Component = asChild ? Slot : "span";
  return (
    <Component
      ref={ref}
      data-slot="tooltip-trigger"
      aria-describedby={contentId}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        setOpen(true);
      }}
      onMouseLeave={(event) => {
        onMouseLeave?.(event);
        setOpen(false);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        setOpen(true);
      }}
      onBlur={(event) => {
        onBlur?.(event);
        setOpen(false);
      }}
      {...props}
    />
  );
});

export interface TooltipContentProps extends HTMLAttributes<HTMLDivElement> {
  side?: "top" | "right" | "bottom" | "left";
}

export const TooltipContent = forwardRef<HTMLDivElement, TooltipContentProps>(function TooltipContent(
  { className, side = "top", ...props },
  ref,
) {
  const { contentId, open } = useTooltipContext();
  const positionClass = {
    top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
    right: "left-full top-1/2 ml-1.5 -translate-y-1/2",
    bottom: "left-1/2 top-full mt-1.5 -translate-x-1/2",
    left: "right-full top-1/2 mr-1.5 -translate-y-1/2",
  }[side];
  return (
    <div
      ref={ref}
      id={contentId}
      data-slot="tooltip-content"
      role="tooltip"
      hidden={!open}
      className={cn(
        "pointer-events-none absolute z-[2147483002] w-max max-w-64 rounded-md bg-popover px-2 py-1 text-[length:var(--font-size-caption)] font-normal text-popover-foreground shadow-lg ring-1 ring-border",
        positionClass,
        className,
      )}
      {...props}
    />
  );
});
