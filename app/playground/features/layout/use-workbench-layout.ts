import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { designSystem } from "../../design-system";
import { clamp } from "../../shared/number-utils";
import {
  defaultResponseHeight,
  layoutStorageKey,
  legacyLayoutStorageKey,
  maxSidebarWidth,
  minResponseHeight,
  minSidebarWidth,
  railWidth,
  sidebarWidth,
} from "../../shared/workbench-constants";
import type { RequestResponseLayoutMode, WorkspaceLayoutSnapshot } from "../../shared/workbench-types";

const defaultResponseWidth = 420;
const minResponseWidth = 300;

export function useWorkbenchLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidthPx, setSidebarWidthPx] = useState(sidebarWidth);
  const [responseHeight, setResponseHeight] = useState(defaultResponseHeight);
  const [responseWidth, setResponseWidth] = useState(defaultResponseWidth);
  const [requestResponseLayout, setRequestResponseLayout] = useState<RequestResponseLayoutMode>("horizontal");
  const [_requestCollapsed, setRequestCollapsed] = useState(false);
  const sidebarResizeRef = useRef(false);
  const responseResizeRef = useRef(false);

  const snapshot = useCallback(
    (): WorkspaceLayoutSnapshot => ({
      sidebarOpen,
      sidebarWidthPx,
      responseHeight,
      responseWidth,
      requestResponseLayout,
    }),
    [sidebarOpen, sidebarWidthPx, responseHeight, responseWidth, requestResponseLayout],
  );

  const applySnapshot = useCallback(
    (layout: Partial<WorkspaceLayoutSnapshot> | null | undefined) => {
      if (!layout) return snapshot();
      const next: WorkspaceLayoutSnapshot = snapshot();
      if (typeof layout.sidebarOpen === "boolean") {
        next.sidebarOpen = layout.sidebarOpen;
        setSidebarOpen(layout.sidebarOpen);
      }
      if (typeof layout.sidebarWidthPx === "number") {
        next.sidebarWidthPx = clamp(layout.sidebarWidthPx, minSidebarWidth, maxSidebarWidth);
        setSidebarWidthPx(next.sidebarWidthPx);
      }
      if (typeof layout.responseHeight === "number") {
        next.responseHeight = Math.max(minResponseHeight, layout.responseHeight);
        setResponseHeight(next.responseHeight);
      }
      if (typeof layout.responseWidth === "number") {
        next.responseWidth = Math.max(minResponseWidth, layout.responseWidth);
        setResponseWidth(next.responseWidth);
      }
      if (layout.requestResponseLayout === "vertical" || layout.requestResponseLayout === "horizontal") {
        next.requestResponseLayout = layout.requestResponseLayout;
        setRequestResponseLayout(layout.requestResponseLayout);
      }
      setRequestCollapsed(false);
      return next;
    },
    [snapshot],
  );

  const applyCachedLayout = useCallback(() => {
    try {
      const rawLayout =
        window.localStorage.getItem(layoutStorageKey) ?? window.localStorage.getItem(legacyLayoutStorageKey);
      const layout = rawLayout ? (JSON.parse(rawLayout) as Partial<WorkspaceLayoutSnapshot>) : {};
      return applySnapshot(layout);
    } catch {
      return snapshot();
    }
  }, [applySnapshot, snapshot]);

  const beginSidebarResize = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    sidebarResizeRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const beginResponseResize = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      responseResizeRef.current = true;
      document.body.style.cursor = requestResponseLayout === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [requestResponseLayout],
  );

  const toggleRequestResponseLayout = useCallback(() => {
    setRequestResponseLayout((current: RequestResponseLayoutMode) =>
      current === "vertical" ? "horizontal" : "vertical",
    );
  }, []);

  useEffect(() => {
    function stopResize() {
      sidebarResizeRef.current = false;
      responseResizeRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    function handleResizeMove(event: MouseEvent) {
      if (sidebarResizeRef.current) {
        const nextWidth = event.clientX - railWidth;
        if (nextWidth < minSidebarWidth - 36) {
          setSidebarOpen(false);
          sidebarResizeRef.current = false;
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        } else {
          setSidebarWidthPx(clamp(nextWidth, minSidebarWidth, maxSidebarWidth));
        }
      }

      if (responseResizeRef.current) {
        if (requestResponseLayout === "horizontal") {
          const activeShellLeft = railWidth + (sidebarOpen ? sidebarWidthPx : 0);
          const maxWidth = Math.max(minResponseWidth, window.innerWidth - activeShellLeft - 420);
          setResponseWidth(clamp(window.innerWidth - event.clientX - 10, minResponseWidth, maxWidth));
        } else {
          const reservedTop = 260;
          const maxHeight = Math.max(
            minResponseHeight,
            window.innerHeight - designSystem.size.titlebarHeight - reservedTop,
          );
          setResponseHeight(clamp(window.innerHeight - event.clientY - 10, minResponseHeight, maxHeight));
        }
      }
    }

    window.addEventListener("mousemove", handleResizeMove);
    window.addEventListener("mouseup", stopResize);
    return () => {
      window.removeEventListener("mousemove", handleResizeMove);
      window.removeEventListener("mouseup", stopResize);
    };
  }, [requestResponseLayout, sidebarOpen, sidebarWidthPx]);

  return {
    sidebarOpen,
    setSidebarOpen,
    sidebarWidthPx,
    setSidebarWidthPx,
    responseHeight,
    setResponseHeight,
    responseWidth,
    setResponseWidth,
    requestResponseLayout,
    setRequestResponseLayout,
    setRequestCollapsed,
    beginSidebarResize,
    beginResponseResize,
    toggleRequestResponseLayout,
    snapshot,
    applySnapshot,
    applyCachedLayout,
  };
}

export { defaultResponseWidth, minResponseWidth };
