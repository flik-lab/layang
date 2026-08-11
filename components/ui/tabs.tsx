"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type TabsContextValue = {
  baseId: string;
  value: string;
  setValue: (value: string) => void;
  orientation: "horizontal" | "vertical";
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) throw new Error("Tabs components must be used inside Tabs");
  return context;
}

export interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: "horizontal" | "vertical";
  children: ReactNode;
}

export function Tabs({
  value,
  defaultValue = "",
  onValueChange,
  orientation = "horizontal",
  className,
  children,
  ...props
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const baseId = useId();
  const selectedValue = value ?? internalValue;
  const context = useMemo<TabsContextValue>(
    () => ({
      baseId,
      value: selectedValue,
      orientation,
      setValue: (nextValue) => {
        if (value === undefined) setInternalValue(nextValue);
        onValueChange?.(nextValue);
      },
    }),
    [baseId, onValueChange, orientation, selectedValue, value],
  );

  return (
    <TabsContext.Provider value={context}>
      <div data-slot="tabs" data-orientation={orientation} className={cn("min-w-0", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export const TabsList = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function TabsList(
  { className, onKeyDown, ...props },
  ref,
) {
  const { orientation } = useTabsContext();
  return (
    <div
      ref={ref}
      data-slot="tabs-list"
      role="tablist"
      aria-orientation={orientation}
      className={cn(
        "inline-flex min-h-[var(--control-height)] items-center gap-1 rounded-md bg-muted p-1 text-muted-foreground",
        orientation === "vertical" && "flex-col items-stretch",
        className,
      )}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        const previousKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
        const nextKey = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
        if (![previousKey, nextKey, "Home", "End"].includes(event.key)) return;
        const triggers = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
        );
        if (triggers.length === 0) return;
        const currentIndex = triggers.indexOf(document.activeElement as HTMLButtonElement);
        const nextIndex =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? triggers.length - 1
              : event.key === nextKey
                ? (Math.max(currentIndex, -1) + 1) % triggers.length
                : (currentIndex <= 0 ? triggers.length : currentIndex) - 1;
        event.preventDefault();
        triggers[nextIndex]?.focus();
        triggers[nextIndex]?.click();
      }}
      {...props}
    />
  );
});

export interface TabsTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(function TabsTrigger(
  { value, className, onClick, ...props },
  ref,
) {
  const context = useTabsContext();
  const active = context.value === value;
  const safeValue = encodeURIComponent(value);
  return (
    <button
      ref={ref}
      data-slot="tabs-trigger"
      data-state={active ? "active" : "inactive"}
      type="button"
      role="tab"
      id={`${context.baseId}-trigger-${safeValue}`}
      aria-controls={`${context.baseId}-content-${safeValue}`}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      className={cn(
        "inline-flex h-[var(--control-height-sm)] items-center justify-center rounded-sm px-2.5 text-[length:var(--font-size-control)] font-medium outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 border border-transparent data-[state=active]:border-primary/35 data-[state=active]:bg-primary/15 data-[state=active]:text-foreground data-[state=active]:shadow-none",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.setValue(value);
      }}
      {...props}
    />
  );
});

export interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  forceMount?: boolean;
}

export const TabsContent = forwardRef<HTMLDivElement, TabsContentProps>(function TabsContent(
  { value, forceMount = false, className, ...props },
  ref,
) {
  const context = useTabsContext();
  const active = context.value === value;
  const safeValue = encodeURIComponent(value);
  if (!active && !forceMount) return null;
  return (
    <div
      ref={ref}
      data-slot="tabs-content"
      data-state={active ? "active" : "inactive"}
      role="tabpanel"
      id={`${context.baseId}-content-${safeValue}`}
      aria-labelledby={`${context.baseId}-trigger-${safeValue}`}
      hidden={!active}
      tabIndex={0}
      className={cn("mt-2 outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      {...props}
    />
  );
});
