import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { designSystem } from "../../design-system";
import { clamp } from "../../shared/number-utils";
import {
  collapsedSidebarWidth,
  defaultResponseHeight,
  layoutStorageKey,
  legacyLayoutStorageKey,
  maxSidebarWidth,
  maxStoredResponseHeight,
  maxStoredResponseWidth,
  minResponseHeight,
  minResponseWidth,
  minSidebarWidth,
  railWidth,
  sidebarWidth,
} from "../../shared/workbench-constants";
import type { RequestResponseLayoutMode, WorkspaceLayoutSnapshot } from "../../shared/workbench-types";

const defaultResponseWidth = 420;
const minRequestWidth = 360;
const responseSeparatorSize = 8;
const minHorizontalWorkspaceWidth = minRequestWidth + minResponseWidth + responseSeparatorSize;

function availableWorkspaceWidth(viewportWidth: number, sidebarOpen: boolean, sidebarWidthPx: number) {
  return Math.max(0, viewportWidth - railWidth - (sidebarOpen ? sidebarWidthPx : collapsedSidebarWidth));
}

function maxResponseWidthForViewport(viewportWidth: number, sidebarOpen: boolean, sidebarWidthPx: number) {
  const available = availableWorkspaceWidth(viewportWidth, sidebarOpen, sidebarWidthPx);
  return Math.max(minResponseWidth, available - minRequestWidth - responseSeparatorSize);
}

function maxResponseHeightForViewport(viewportHeight: number) {
  const reservedTop = 260;
  return Math.max(minResponseHeight, viewportHeight - designSystem.size.titlebarHeight - reservedTop);
}

export function useWorkbenchLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidthPx, setSidebarWidthPx] = useState<number>(sidebarWidth);
  const [responseHeight, setResponseHeight] = useState(defaultResponseHeight);
  const [responseWidth, setResponseWidth] = useState(defaultResponseWidth);
  const [requestResponseLayout, setRequestResponseLayout] = useState<RequestResponseLayoutMode>("vertical");
  const [_requestCollapsed, setRequestCollapsed] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const sidebarResizeRef = useRef(false);
  const responseResizeRef = useRef(false);

  const horizontalLayoutAvailable =
    viewportSize.width === 0 ||
    availableWorkspaceWidth(viewportSize.width, sidebarOpen, sidebarWidthPx) >= minHorizontalWorkspaceWidth;
  const effectiveRequestResponseLayout: RequestResponseLayoutMode =
    requestResponseLayout === "horizontal" && horizontalLayoutAvailable ? "horizontal" : "vertical";

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
        next.responseHeight = clamp(layout.responseHeight, minResponseHeight, maxStoredResponseHeight);
        setResponseHeight(next.responseHeight);
      }
      if (typeof layout.responseWidth === "number") {
        next.responseWidth = clamp(layout.responseWidth, minResponseWidth, maxStoredResponseWidth);
        setResponseWidth(next.responseWidth);
      }
      if (layout.requestResponseLayout === "horizontal" || layout.requestResponseLayout === "vertical") {
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
      document.body.style.cursor = effectiveRequestResponseLayout === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [effectiveRequestResponseLayout],
  );

  const toggleRequestResponseLayout = useCallback(() => {
    setRequestResponseLayout((current) => (current === "horizontal" ? "vertical" : "horizontal"));
  }, []);

  const resizeResponseByKeyboard = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 40 : 10;
      if (effectiveRequestResponseLayout === "horizontal") {
        const maxWidth = maxResponseWidthForViewport(window.innerWidth, sidebarOpen, sidebarWidthPx);
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setResponseWidth((current) => clamp(current + step, minResponseWidth, maxWidth));
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          setResponseWidth((current) => clamp(current - step, minResponseWidth, maxWidth));
        } else if (event.key === "Home") {
          event.preventDefault();
          setResponseWidth(minResponseWidth);
        } else if (event.key === "End") {
          event.preventDefault();
          setResponseWidth(maxWidth);
        }
        return;
      }
      const maxHeight = maxResponseHeightForViewport(window.innerHeight);
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setResponseHeight((current) => clamp(current + step, minResponseHeight, maxHeight));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setResponseHeight((current) => clamp(current - step, minResponseHeight, maxHeight));
      } else if (event.key === "Home") {
        event.preventDefault();
        setResponseHeight(minResponseHeight);
      } else if (event.key === "End") {
        event.preventDefault();
        setResponseHeight(maxHeight);
      }
    },
    [effectiveRequestResponseLayout, sidebarOpen, sidebarWidthPx],
  );

  useEffect(() => {
    const syncViewport = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    if (viewportSize.height > 0) {
      const maxHeight = maxResponseHeightForViewport(viewportSize.height);
      setResponseHeight((current) => clamp(current, minResponseHeight, maxHeight));
    }
    if (viewportSize.width > 0 && requestResponseLayout === "horizontal" && horizontalLayoutAvailable) {
      const maxWidth = maxResponseWidthForViewport(viewportSize.width, sidebarOpen, sidebarWidthPx);
      setResponseWidth((current) => clamp(current, minResponseWidth, maxWidth));
    }
  }, [
    horizontalLayoutAvailable,
    requestResponseLayout,
    responseHeight,
    responseWidth,
    sidebarOpen,
    sidebarWidthPx,
    viewportSize.height,
    viewportSize.width,
  ]);

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
        if (effectiveRequestResponseLayout === "horizontal") {
          const maxWidth = maxResponseWidthForViewport(window.innerWidth, sidebarOpen, sidebarWidthPx);
          setResponseWidth(clamp(window.innerWidth - event.clientX - 10, minResponseWidth, maxWidth));
        } else {
          const maxHeight = maxResponseHeightForViewport(window.innerHeight);
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
  }, [effectiveRequestResponseLayout, sidebarOpen, sidebarWidthPx]);

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
    effectiveRequestResponseLayout,
    horizontalLayoutAvailable,
    setRequestResponseLayout,
    setRequestCollapsed,
    beginSidebarResize,
    beginResponseResize,
    resizeResponseByKeyboard,
    toggleRequestResponseLayout,
    snapshot,
    applySnapshot,
    applyCachedLayout,
  };
}

export { defaultResponseWidth, minHorizontalWorkspaceWidth, minResponseWidth };
