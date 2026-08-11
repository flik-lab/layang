"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function WorkbenchPanel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      data-slot="workbench-panel"
      className={cn(
        "flex h-full w-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md bg-card text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function WorkbenchPanelHeader({
  icon,
  title,
  description,
  meta,
  actions,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header
      data-slot="workbench-panel-header"
      className={cn("flex min-h-[60px] shrink-0 items-center gap-2 border-b border-border px-3 py-2", className)}
      {...props}
    >
      {icon ? (
        <span className="inline-flex size-5 shrink-0 items-center justify-center text-primary">{icon}</span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <h1 className="min-w-0 truncate text-[length:var(--font-size-page-title)] font-semibold leading-tight">
            {title}
          </h1>
          {meta}
        </div>
        {description ? (
          <p
            className="truncate text-[length:var(--font-size-body)] leading-snug text-muted-foreground"
            title={typeof description === "string" ? description : undefined}
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </header>
  );
}

export type WorkbenchTabItem = {
  value: string;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
};

export function WorkbenchTabs({
  value,
  items,
  onValueChange,
  ariaLabel,
  idPrefix,
  className,
  bordered = true,
  variant = "pill",
}: {
  value: string;
  items: WorkbenchTabItem[];
  onValueChange: (value: string) => void;
  ariaLabel: string;
  idPrefix?: string;
  className?: string;
  bordered?: boolean;
  variant?: "pill" | "underline" | "section";
}) {
  const resolvedIdPrefix = idPrefix;
  return (
    <div
      data-slot="workbench-tabs"
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex shrink-0 items-center overflow-x-auto",
        variant === "underline"
          ? "min-h-10 gap-4 px-3 py-0"
          : variant === "section"
            ? "h-10 gap-1 bg-muted/10 px-3"
            : "min-h-10 gap-1 px-2 py-1",
        bordered && "border-b border-border",
        className,
      )}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
        if (tabs.length === 0) return;
        const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
        const nextIndex =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : event.key === "ArrowRight"
                ? (Math.max(currentIndex, -1) + 1) % tabs.length
                : (currentIndex <= 0 ? tabs.length : currentIndex) - 1;
        event.preventDefault();
        tabs[nextIndex]?.focus();
        tabs[nextIndex]?.click();
      }}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Button
            key={item.value}
            type="button"
            role="tab"
            id={resolvedIdPrefix ? `${resolvedIdPrefix}-tab-${item.value}` : undefined}
            aria-controls={resolvedIdPrefix ? `${resolvedIdPrefix}-panel-${item.value}` : undefined}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            size="sm"
            variant={
              variant === "underline"
                ? "ghost"
                : variant === "section"
                  ? active
                    ? "secondary"
                    : "ghost"
                  : active
                    ? "secondary"
                    : "ghost"
            }
            className={cn(
              "min-w-fit font-medium",
              variant === "section" && "h-8",
              variant === "underline" &&
                "relative h-10 rounded-none border-b-2 border-transparent px-0 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground",
              variant === "underline" && active && "border-primary text-foreground",
              variant === "pill" &&
                active &&
                "border border-primary/40 bg-primary/15 text-foreground shadow-none hover:bg-primary/20",
              variant === "pill" && !active && "border border-transparent text-muted-foreground",
              variant === "section" && active && "border border-primary/35 bg-primary/12 text-foreground shadow-none",
            )}
            onClick={() => onValueChange(item.value)}
          >
            <span className="inline-flex items-center gap-1.5">{item.label}</span>
            {item.count !== undefined && item.count > 0 ? (
              <Badge
                variant={variant === "underline" ? "muted" : active && variant !== "section" ? "secondary" : "muted"}
                className={cn(
                  variant === "section"
                    ? "h-[22px] min-w-[22px] px-1.5 text-[length:var(--font-size-caption)]"
                    : "h-5 min-w-5 rounded-sm px-1 text-[length:var(--font-size-caption)]",
                )}
              >
                {item.count}
              </Badge>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}

export function WorkbenchTabPanel({
  idPrefix,
  value,
  activeValue,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  idPrefix: string;
  value: string;
  activeValue: string;
  children: ReactNode;
}) {
  const active = value === activeValue;
  return (
    <section
      {...props}
      role="tabpanel"
      id={`${idPrefix}-panel-${value}`}
      aria-labelledby={`${idPrefix}-tab-${value}`}
      hidden={!active}
      tabIndex={active ? 0 : -1}
      className={cn(
        "min-h-0 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        className,
      )}
    >
      {active ? children : null}
    </section>
  );
}

export function WorkbenchEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="workbench-empty-state"
      className={cn("flex min-h-52 flex-1 flex-col items-center justify-center gap-1.5 p-6 text-center", className)}
    >
      {icon ? (
        <span className="mb-1 inline-flex size-9 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <h2 className="text-[length:var(--font-size-section)] font-semibold">{title}</h2>
      {description ? (
        <p className="max-w-lg text-[length:var(--font-size-body)] text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
