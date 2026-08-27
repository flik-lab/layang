import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface SeparatorProps extends HTMLAttributes<HTMLHRElement> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

export function Separator({ className, orientation = "horizontal", decorative = true, ...props }: SeparatorProps) {
  if (decorative) {
    return (
      <div
        data-slot="separator"
        role="none"
        className={cn("shrink-0 bg-border", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)}
        {...props}
      />
    );
  }

  return (
    <hr
      data-slot="separator"
      aria-orientation={orientation}
      className={cn(
        "shrink-0 border-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
