"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

import { Table, TableCell, TableContainer, TableHead, TableRow } from "@/components/shadcn/compat";

type SxMap = Record<string, unknown>;

export type ResizableTableColumn = {
  id: string;
  label: ReactNode;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  sx?: SxMap;
  headerSx?: SxMap;
};

export type ResizableTableProps = {
  columns: ResizableTableColumn[];
  children: ReactNode;
  tableSx?: SxMap;
  containerSx?: SxMap;
};

const defaultMinColumnWidth = 44;
const defaultMaxColumnWidth = 1200;
const resizeHandleWidth = 8;

/**
 * Table shell with draggable header handles and a shared colgroup width model.
 * Keep row rendering in callers so feature tables can still use custom cells,
 * expanded rows, chips, and colSpan-based empty states.
 */
export function ResizableTable({ columns, children, tableSx, containerSx }: ResizableTableProps) {
  const initialWidths = useMemo(
    () => Object.fromEntries(columns.map((column) => [column.id, clampWidth(column.width, column)])),
    [columns],
  );
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(initialWidths);

  useEffect(() => {
    setColumnWidths((current: any) => {
      let changed = false;
      const next = { ...current };
      for (const column of columns) {
        if (typeof next[column.id] !== "number") {
          next[column.id] = clampWidth(column.width, column);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [columns]);

  const startResize = useCallback(
    (event: ReactMouseEvent<HTMLSpanElement>, column: ResizableTableColumn) => {
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startWidth = columnWidths[column.id] ?? column.width;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        setColumnWidths((current: any) => ({
          ...current,
          [column.id]: clampWidth(startWidth + delta, column),
        }));
      };
      const handleMouseUp = () => {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [columnWidths],
  );

  return (
    <TableContainer sx={containerSx}>
      <Table size="small" sx={{ tableLayout: "fixed", minWidth: totalWidth(columns, columnWidths), ...tableSx }}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.id} style={{ width: columnWidths[column.id] ?? column.width }} />
          ))}
        </colgroup>
        <TableHead>
          <TableRow>
            {columns.map((column, index) => (
              <TableCell
                key={column.id}
                sx={{
                  position: "relative",
                  width: columnWidths[column.id] ?? column.width,
                  minWidth: column.minWidth ?? defaultMinColumnWidth,
                  maxWidth: column.maxWidth ?? defaultMaxColumnWidth,
                  whiteSpace: "nowrap",
                  userSelect: "none",
                  ...column.sx,
                  ...column.headerSx,
                }}
              >
                {column.label}
                {index < columns.length - 1 && (
                  <span
                    aria-hidden="true"
                    title="Drag to resize column"
                    onMouseDown={(resizeEvent: any) => startResize(resizeEvent, column)}
                    style={{
                      position: "absolute",
                      top: 0,
                      right: -resizeHandleWidth / 2,
                      width: resizeHandleWidth,
                      height: "100%",
                      cursor: "col-resize",
                      borderRight: "1px solid var(--border-strong, var(--border))",
                      opacity: 0.45,
                      zIndex: 2,
                    }}
                  />
                )}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        {children}
      </Table>
    </TableContainer>
  );
}

function clampWidth(width: number, column: ResizableTableColumn): number {
  const min = column.minWidth ?? defaultMinColumnWidth;
  const max = column.maxWidth ?? defaultMaxColumnWidth;
  return Math.min(max, Math.max(min, Math.round(width)));
}

function totalWidth(columns: ResizableTableColumn[], widths: Record<string, number>): number {
  return columns.reduce((sum, column) => sum + (widths[column.id] ?? column.width), 0);
}
