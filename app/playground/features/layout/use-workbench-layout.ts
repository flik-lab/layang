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
  layoutStorageKey,
  legacyLayoutStorageKey,
  maxSidebarWidth,
  minResponseHeight,
  minResponseWidth,
  minSidebarWidth,
  railWidth,
  sidebarWidth,
} from "../../shared/workbench-constants";
import type {
  RequestResponseLayoutMode,
  RequestViewStateSnapshot,
  WorkspaceLayoutSnapshot,
} from "../../shared/workbench-types";

const defaultResponseWidth = 420;
const minRequestWidth = 360;
const minRequestHeight = 180;
const responseSeparatorSize = 8;
const minHorizontalWorkspaceWidth = minRequestWidth + minResponseWidth + responseSeparatorSize;
const defaultVerticalResponseRatio = 0.42;
const defaultHorizontalResponseRatio = 0.42;
const minResponseRatio = 0.12;
const maxResponseRatio = 0.88;
const defaultRequestViewKey = "__default__";

function createDefaultRequestView(): RequestViewStateSnapshot {
  return {
    verticalResponseRatio: defaultVerticalResponseRatio,
    horizontalResponseRatio: defaultHorizontalResponseRatio,
    responseCollapsed: false,
  };
}

function normalizeRatio(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, minResponseRatio, maxResponseRatio)
    : fallback;
}

function normalizeRequestView(value: Partial<RequestViewStateSnapshot> | null | undefined): RequestViewStateSnapshot {
  const fallback = createDefaultRequestView();
  return {
    ...fallback,
    ...value,
    verticalResponseRatio: normalizeRatio(value?.verticalResponseRatio, fallback.verticalResponseRatio),
    horizontalResponseRatio: normalizeRatio(value?.horizontalResponseRatio, fallback.horizontalResponseRatio),
    requestResponseLayout:
      value?.requestResponseLayout === "horizontal" || value?.requestResponseLayout === "vertical"
        ? value.requestResponseLayout
        : undefined,
    responseCollapsed: Boolean(value?.responseCollapsed),
  };
}

function availableWorkspaceWidth(viewportWidth: number, sidebarOpen: boolean, sidebarWidthPx: number) {
  return Math.max(0, viewportWidth - railWidth - (sidebarOpen ? sidebarWidthPx : collapsedSidebarWidth));
}

function availableVerticalSplitHeight(viewportHeight: number) {
  const statusbarHeight = designSystem.size.statusbarHeight ?? 24;
  const requestChromeAllowance = 150;
  return Math.max(
    minResponseHeight + minRequestHeight + responseSeparatorSize,
    viewportHeight - designSystem.size.titlebarHeight - statusbarHeight - requestChromeAllowance,
  );
}

function maxResponseWidthForViewport(viewportWidth: number, sidebarOpen: boolean, sidebarWidthPx: number) {
  const available = availableWorkspaceWidth(viewportWidth, sidebarOpen, sidebarWidthPx);
  return Math.max(minResponseWidth, available - minRequestWidth - responseSeparatorSize);
}

function maxResponseHeightForViewport(viewportHeight: number) {
  return Math.max(minResponseHeight, availableVerticalSplitHeight(viewportHeight) - minRequestHeight - responseSeparatorSize);
}

function responseWidthFromRatio(
  ratio: number,
  viewportWidth: number,
  sidebarOpen: boolean,
  sidebarWidthPx: number,
) {
  const available = Math.max(minResponseWidth, availableWorkspaceWidth(viewportWidth, sidebarOpen, sidebarWidthPx));
  const maxWidth = maxResponseWidthForViewport(viewportWidth, sidebarOpen, sidebarWidthPx);
  return clamp(Math.round(available * ratio), minResponseWidth, maxWidth);
}

function responseHeightFromRatio(ratio: number, viewportHeight: number) {
  const available = availableVerticalSplitHeight(viewportHeight);
  const maxHeight = maxResponseHeightForViewport(viewportHeight);
  return clamp(Math.round(available * ratio), minResponseHeight, maxHeight);
}

export function useWorkbenchLayout(activeRequestId = "") {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidthPx, setSidebarWidthPx] = useState<number>(sidebarWidth);
  const [requestResponseLayout, setRequestResponseLayout] = useState<RequestResponseLayoutMode>("vertical");
  const [_requestCollapsed, setRequestCollapsed] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [requestViews, setRequestViews] = useState<Record<string, RequestViewStateSnapshot>>({});
  const sidebarResizeRef = useRef(false);
  const responseResizeRef = useRef(false);
  const resizeFrameRef = useRef<number | null>(null);
  const resizePointRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const activeRequestViewKey = activeRequestId || defaultRequestViewKey;
  const activeRequestView = normalizeRequestView(requestViews[activeRequestViewKey]);
  // Keep the render path deterministic. Real viewport dimensions are applied by
  // the resize effect after mount so SSR and the first client render never diverge.
  const effectiveViewportWidth = viewportSize.width || 1500;
  const effectiveViewportHeight = viewportSize.height || 980;
  const responseHeight = responseHeightFromRatio(activeRequestView.verticalResponseRatio, effectiveViewportHeight);
  const responseWidth = responseWidthFromRatio(
    activeRequestView.horizontalResponseRatio,
    effectiveViewportWidth,
    sidebarOpen,
    sidebarWidthPx,
  );
  const responseCollapsed = Boolean(activeRequestView.responseCollapsed);
  const activeRequestResponseLayout = activeRequestView.requestResponseLayout ?? requestResponseLayout;

  const horizontalLayoutAvailable =
    viewportSize.width === 0 ||
    availableWorkspaceWidth(viewportSize.width, sidebarOpen, sidebarWidthPx) >= minHorizontalWorkspaceWidth;
  const effectiveRequestResponseLayout: RequestResponseLayoutMode =
    activeRequestResponseLayout === "horizontal" && horizontalLayoutAvailable ? "horizontal" : "vertical";

  const updateActiveRequestView = useCallback(
    (patch: Partial<RequestViewStateSnapshot>) => {
      setRequestViews((current) => {
        const previous = normalizeRequestView(current[activeRequestViewKey]);
        const next = normalizeRequestView({ ...previous, ...patch });
        const unchanged =
          previous.verticalResponseRatio === next.verticalResponseRatio &&
          previous.horizontalResponseRatio === next.horizontalResponseRatio &&
          previous.requestResponseLayout === next.requestResponseLayout &&
          previous.responseCollapsed === next.responseCollapsed &&
          previous.requestTab === next.requestTab &&
          previous.responseTab === next.responseTab;
        if (unchanged) return current;
        return { ...current, [activeRequestViewKey]: next };
      });
    },
    [activeRequestViewKey],
  );

  const setResponseHeight = useCallback(
    (value: number | ((current: number) => number)) => {
      const currentHeight = responseHeightFromRatio(activeRequestView.verticalResponseRatio, effectiveViewportHeight);
      const nextHeight = typeof value === "function" ? value(currentHeight) : value;
      const available = availableVerticalSplitHeight(effectiveViewportHeight);
      const maxHeight = maxResponseHeightForViewport(effectiveViewportHeight);
      const clampedHeight = clamp(nextHeight, minResponseHeight, maxHeight);
      updateActiveRequestView({ verticalResponseRatio: clampedHeight / Math.max(1, available) });
    },
    [activeRequestView.verticalResponseRatio, effectiveViewportHeight, updateActiveRequestView],
  );

  const setResponseWidth = useCallback(
    (value: number | ((current: number) => number)) => {
      const currentWidth = responseWidthFromRatio(
        activeRequestView.horizontalResponseRatio,
        effectiveViewportWidth,
        sidebarOpen,
        sidebarWidthPx,
      );
      const nextWidth = typeof value === "function" ? value(currentWidth) : value;
      const available = Math.max(
        minResponseWidth,
        availableWorkspaceWidth(effectiveViewportWidth, sidebarOpen, sidebarWidthPx),
      );
      const maxWidth = maxResponseWidthForViewport(effectiveViewportWidth, sidebarOpen, sidebarWidthPx);
      const clampedWidth = clamp(nextWidth, minResponseWidth, maxWidth);
      updateActiveRequestView({ horizontalResponseRatio: clampedWidth / Math.max(1, available) });
    },
    [
      activeRequestView.horizontalResponseRatio,
      effectiveViewportWidth,
      sidebarOpen,
      sidebarWidthPx,
      updateActiveRequestView,
    ],
  );

  const setResponseCollapsed = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      const next = typeof value === "function" ? value(responseCollapsed) : value;
      updateActiveRequestView({ responseCollapsed: next });
    },
    [responseCollapsed, updateActiveRequestView],
  );

  const snapshot = useCallback(
    (): WorkspaceLayoutSnapshot => ({
      sidebarOpen,
      sidebarWidthPx,
      responseHeight,
      responseWidth,
      requestResponseLayout,
      requestViews,
    }),
    [sidebarOpen, sidebarWidthPx, responseHeight, responseWidth, requestResponseLayout, requestViews],
  );

  const applySnapshot = useCallback(
    (layout: Partial<WorkspaceLayoutSnapshot> | null | undefined) => {
      if (!layout) return snapshot();
      if (typeof layout.sidebarOpen === "boolean") setSidebarOpen(layout.sidebarOpen);
      if (typeof layout.sidebarWidthPx === "number") {
        setSidebarWidthPx(clamp(layout.sidebarWidthPx, minSidebarWidth, maxSidebarWidth));
      }
      if (layout.requestResponseLayout === "horizontal" || layout.requestResponseLayout === "vertical") {
        setRequestResponseLayout(layout.requestResponseLayout);
      }

      if (layout.requestViews && typeof layout.requestViews === "object") {
        const normalized = Object.fromEntries(
          Object.entries(layout.requestViews).map(([key, value]) => [key, normalizeRequestView(value)]),
        );
        setRequestViews(normalized);
      } else if (typeof layout.responseHeight === "number" || typeof layout.responseWidth === "number") {
        // Migrate legacy global pixel dimensions into the active/default request ratio.
        const verticalAvailable = availableVerticalSplitHeight(effectiveViewportHeight);
        const horizontalAvailable = Math.max(
          minResponseWidth,
          availableWorkspaceWidth(effectiveViewportWidth, sidebarOpen, sidebarWidthPx),
        );
        setRequestViews((current) => ({
          ...current,
          [activeRequestViewKey]: normalizeRequestView({
            ...(current[activeRequestViewKey] ?? createDefaultRequestView()),
            verticalResponseRatio:
              typeof layout.responseHeight === "number"
                ? clamp(layout.responseHeight, minResponseHeight, maxResponseHeightForViewport(effectiveViewportHeight)) /
                  Math.max(1, verticalAvailable)
                : activeRequestView.verticalResponseRatio,
            horizontalResponseRatio:
              typeof layout.responseWidth === "number"
                ? clamp(
                    layout.responseWidth,
                    minResponseWidth,
                    maxResponseWidthForViewport(effectiveViewportWidth, sidebarOpen, sidebarWidthPx),
                  ) / Math.max(1, horizontalAvailable)
                : activeRequestView.horizontalResponseRatio,
          }),
        }));
      }
      setRequestCollapsed(false);
      return {
        ...snapshot(),
        ...layout,
      } as WorkspaceLayoutSnapshot;
    },
    [
      activeRequestView.horizontalResponseRatio,
      activeRequestView.verticalResponseRatio,
      activeRequestViewKey,
      effectiveViewportHeight,
      effectiveViewportWidth,
      sidebarOpen,
      sidebarWidthPx,
      snapshot,
    ],
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
    updateActiveRequestView({
      requestResponseLayout: activeRequestResponseLayout === "horizontal" ? "vertical" : "horizontal",
    });
  }, [activeRequestResponseLayout, updateActiveRequestView]);

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
    [effectiveRequestResponseLayout, setResponseHeight, setResponseWidth, sidebarOpen, sidebarWidthPx],
  );

  useEffect(() => {
    const syncViewport = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    function applyResizePoint(point: { clientX: number; clientY: number } | null) {
      if (!point) return;

      if (sidebarResizeRef.current) {
        const nextWidth = point.clientX - railWidth;
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
          setResponseWidth(window.innerWidth - point.clientX - 10);
        } else {
          setResponseHeight(window.innerHeight - point.clientY - 10);
        }
      }
    }

    function flushResizeFrame() {
      resizeFrameRef.current = null;
      const point = resizePointRef.current;
      resizePointRef.current = null;
      applyResizePoint(point);
    }

    function stopResize() {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      const finalPoint = resizePointRef.current;
      resizePointRef.current = null;
      applyResizePoint(finalPoint);
      sidebarResizeRef.current = false;
      responseResizeRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    function handleResizeMove(event: MouseEvent) {
      if (!sidebarResizeRef.current && !responseResizeRef.current) return;
      resizePointRef.current = { clientX: event.clientX, clientY: event.clientY };
      if (resizeFrameRef.current !== null) return;
      resizeFrameRef.current = window.requestAnimationFrame(flushResizeFrame);
    }

    window.addEventListener("mousemove", handleResizeMove);
    window.addEventListener("mouseup", stopResize);
    return () => {
      if (resizeFrameRef.current !== null) window.cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
      resizePointRef.current = null;
      window.removeEventListener("mousemove", handleResizeMove);
      window.removeEventListener("mouseup", stopResize);
    };
  }, [effectiveRequestResponseLayout, setResponseHeight, setResponseWidth]);

  return {
    sidebarOpen,
    setSidebarOpen,
    sidebarWidthPx,
    setSidebarWidthPx,
    responseHeight,
    setResponseHeight,
    responseWidth,
    setResponseWidth,
    responseCollapsed,
    setResponseCollapsed,
    requestViews,
    setRequestViews,
    updateActiveRequestView,
    requestResponseLayout,
    activeRequestResponseLayout,
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

export {
  defaultHorizontalResponseRatio,
  defaultResponseWidth,
  defaultVerticalResponseRatio,
  minHorizontalWorkspaceWidth,
  minResponseWidth,
};
