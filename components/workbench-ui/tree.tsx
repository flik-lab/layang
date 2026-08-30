"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared workbench tree metrics. Collections, Schemas, Mocking, and Docs should converge on these values. */
export const workbenchTreeMetrics = {
  rootRowHeight: 26,
  rowHeight: 23,
  indent: 12,
  basePadding: 4,
} as const;

/**
 * Nested workbench groups intentionally own indentation rather than individual rows.
 * This mirrors VS Code Explorer: every child level advances by one compact step and
 * paints one continuous guide line, while selected rows can still span the available width.
 */
export const workbenchTreeGroupSx = {
  ml: `${workbenchTreeMetrics.indent}px`,
  pl: "1px",
  borderLeft: "1px solid var(--workbench-tree-guide)",
  minWidth: 0,
} as const;

export function WorkbenchTree({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      role="tree"
      data-slot="workbench-tree"
      className={cn("min-w-0 px-[4px] py-0", className)}
      {...props}
    >
      {children}
    </div>
  );
}
