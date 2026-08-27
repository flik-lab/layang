import {
  forwardRef,
  type HTMLAttributes,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

export const TableContainer = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function TableContainer(
  { className, ...props },
  ref,
) {
  return <div ref={ref} data-slot="table-container" className={cn("w-full overflow-auto", className)} {...props} />;
});

export const Table = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement>>(function Table(
  { className, ...props },
  ref,
) {
  return (
    <table
      ref={ref}
      data-slot="table"
      className={cn("w-full caption-bottom text-[length:var(--font-size-body)]", className)}
      {...props}
    />
  );
});

export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function TableHeader({ className, ...props }, ref) {
    return (
      <thead ref={ref} data-slot="table-header" className={cn("bg-muted/50 [&_tr]:border-b", className)} {...props} />
    );
  },
);

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function TableBody({ className, ...props }, ref) {
    return (
      <tbody ref={ref} data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />
    );
  },
);

export const TableFooter = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function TableFooter({ className, ...props }, ref) {
    return (
      <tfoot
        ref={ref}
        data-slot="table-footer"
        className={cn("border-t bg-muted/50 font-medium", className)}
        {...props}
      />
    );
  },
);

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(function TableRow(
  { className, ...props },
  ref,
) {
  return (
    <tr
      ref={ref}
      data-slot="table-row"
      className={cn(
        "border-b border-border transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
});

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(function TableHead(
  { className, ...props },
  ref,
) {
  return (
    <th
      ref={ref}
      data-slot="table-head"
      className={cn(
        "h-8 px-2.5 text-left align-middle text-[length:var(--font-size-caption)] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
});

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(function TableCell(
  { className, ...props },
  ref,
) {
  return <td ref={ref} data-slot="table-cell" className={cn("px-2.5 py-2 align-middle", className)} {...props} />;
});

export const TableCaption = forwardRef<HTMLTableCaptionElement, HTMLAttributes<HTMLTableCaptionElement>>(
  function TableCaption({ className, ...props }, ref) {
    return (
      <caption
        ref={ref}
        data-slot="table-caption"
        className={cn("mt-3 text-[length:var(--font-size-body)] text-muted-foreground", className)}
        {...props}
      />
    );
  },
);
