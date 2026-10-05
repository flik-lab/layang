"use client";

import { applyWorkspaceLayoutSnapshot } from "./workspace-model";
import { clamp } from "../../shared/number-utils";
import { scheduleIdleTask } from "../../shared/performance/interaction-performance";
import {
  layoutStorageKey,
  maxSidebarWidth,
  maxStoredResponseHeight,
  maxStoredResponseWidth,
  minResponseHeight,
  minResponseWidth,
  minSidebarWidth,
} from "../../shared/workbench-constants";
import type {
  RequestResponseLayoutMode,
  RequestViewStateSnapshot,
  WorkspaceLayoutSnapshot,
} from "../../shared/workbench-types";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type WorkspaceLayoutPersistenceScope = {
  requestResponseLayout: RequestResponseLayoutMode;
  requestViews: WorkspaceLayoutSnapshot["requestViews"];
  setRequestViews: StateSetter<Record<string, RequestViewStateSnapshot>>;
  responseHeight: number;
  responseWidth: number;
  setRequestResponseLayout: StateSetter<RequestResponseLayoutMode>;
  setResponseHeight: StateSetter<number>;
  setResponseWidth: StateSetter<number>;
  setSidebarOpen: StateSetter<boolean>;
  setSidebarWidthPx: StateSetter<number>;
  sidebarOpen: boolean;
  sidebarWidthPx: number;
};

export function useWorkspaceLayoutPersistence(scope: WorkspaceLayoutPersistenceScope) {
  const {
    requestResponseLayout,
    requestViews,
    setRequestViews,
    responseHeight,
    responseWidth,
    setRequestResponseLayout,
    setResponseHeight,
    setResponseWidth,
    setSidebarOpen,
    setSidebarWidthPx,
    sidebarOpen,
    sidebarWidthPx,
  } = scope;

  function applyWorkspaceLayout(layout: Partial<WorkspaceLayoutSnapshot>) {
    applyWorkspaceLayoutSnapshot(layout, {
      setSidebarOpen,
      setSidebarWidthPx,
      setResponseHeight,
      setResponseWidth,
      setRequestResponseLayout,
    });
    if (layout.requestViews && typeof layout.requestViews === "object") {
      setRequestViews(layout.requestViews);
    }
    const persistedLayout = {
      sidebarOpen: typeof layout.sidebarOpen === "boolean" ? layout.sidebarOpen : sidebarOpen,
      sidebarWidthPx:
        typeof layout.sidebarWidthPx === "number"
          ? clamp(layout.sidebarWidthPx, minSidebarWidth, maxSidebarWidth)
          : sidebarWidthPx,
      responseHeight:
        typeof layout.responseHeight === "number"
          ? clamp(layout.responseHeight, minResponseHeight, maxStoredResponseHeight)
          : responseHeight,
      responseWidth:
        typeof layout.responseWidth === "number"
          ? clamp(layout.responseWidth, minResponseWidth, maxStoredResponseWidth)
          : responseWidth,
      requestResponseLayout:
        layout.requestResponseLayout === "vertical" || layout.requestResponseLayout === "horizontal"
          ? layout.requestResponseLayout
          : requestResponseLayout,
      requestViews: layout.requestViews ?? requestViews,
    } satisfies WorkspaceLayoutSnapshot;

    scheduleIdleTask("workspace-layout", () => {
      window.localStorage.setItem(layoutStorageKey, JSON.stringify(persistedLayout));
    });
  }

  function getLayoutSnapshot(): WorkspaceLayoutSnapshot {
    return {
      sidebarOpen,
      sidebarWidthPx,
      responseHeight,
      responseWidth,
      requestResponseLayout,
      requestViews,
    };
  }

  return { applyWorkspaceLayout, getLayoutSnapshot };
}
