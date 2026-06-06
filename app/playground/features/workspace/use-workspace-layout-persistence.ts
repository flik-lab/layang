"use client";

import { applyWorkspaceLayoutSnapshot } from "./workspace-model";
import { clamp } from "../../shared/number-utils";
import {
  layoutStorageKey,
  maxSidebarWidth,
  minResponseHeight,
  minSidebarWidth,
} from "../../shared/workbench-constants";
import { minResponseWidth } from "../layout/use-workbench-layout";
import type { RequestResponseLayoutMode, WorkspaceLayoutSnapshot } from "../../shared/workbench-types";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type WorkspaceLayoutPersistenceScope = {
  requestResponseLayout: RequestResponseLayoutMode;
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
    window.localStorage.setItem(
      layoutStorageKey,
      JSON.stringify({
        sidebarOpen: typeof layout.sidebarOpen === "boolean" ? layout.sidebarOpen : sidebarOpen,
        sidebarWidthPx:
          typeof layout.sidebarWidthPx === "number"
            ? clamp(layout.sidebarWidthPx, minSidebarWidth, maxSidebarWidth)
            : sidebarWidthPx,
        responseHeight:
          typeof layout.responseHeight === "number"
            ? Math.max(minResponseHeight, layout.responseHeight)
            : responseHeight,
        responseWidth:
          typeof layout.responseWidth === "number" ? Math.max(minResponseWidth, layout.responseWidth) : responseWidth,
        requestResponseLayout:
          layout.requestResponseLayout === "vertical" || layout.requestResponseLayout === "horizontal"
            ? layout.requestResponseLayout
            : requestResponseLayout,
      }),
    );
  }

  function getLayoutSnapshot(): WorkspaceLayoutSnapshot {
    return {
      sidebarOpen,
      sidebarWidthPx,
      responseHeight,
      responseWidth,
      requestResponseLayout,
    };
  }

  return { applyWorkspaceLayout, getLayoutSnapshot };
}
