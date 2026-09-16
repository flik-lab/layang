"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ProtoRuntimeRegistry } from "@/lib/proto-runtime-registry";
import type { MockServerProject, MockServerStatus } from "../../../shared/workbench-types";
import { buildMockCatalogSourceSnapshot } from "./mockCatalogRuntime";
import { mockCatalogStore } from "./mockCatalog.store";
import type { MockCatalogQuery } from "./mockCatalog.types";
import { useMockingUiSnapshot } from "../workspace/mockingUi.store";

export function useMockCatalog() {
  return useSyncExternalStore(mockCatalogStore.subscribe, mockCatalogStore.getSnapshot, mockCatalogStore.getSnapshot);
}

/**
 * Synchronizes compact catalog metadata after the active Services workspace paints.
 * Full scenario bodies stay outside the catalog worker.
 */
export function useMockCatalogSourceSync(options: {
  mockServer: MockServerProject;
  mockServerStatus?: MockServerStatus;
  protoRuntimeRegistry: ProtoRuntimeRegistry;
}): void {
  const { mockServer, mockServerStatus, protoRuntimeRegistry } = options;

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      try {
        const source = buildMockCatalogSourceSnapshot(mockServer, protoRuntimeRegistry);
        void mockCatalogStore.syncSource(source);
      } catch (error) {
        console.error("Mock catalog source sync failed.", error);
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mockServer.protoSources, mockServer.methodFiles, mockServer.format, protoRuntimeRegistry]);

  useEffect(() => {
    void mockCatalogStore.updateRuntime({
      selectedScenarioIds: mockServer.selectedScenarioIds,
      enabledMethods: mockServer.enabledMethods,
      running: Boolean(mockServerStatus?.running),
    }).catch((error: unknown) => {
      console.error("Mock catalog runtime sync failed.", error);
    });
  }, [mockServer.selectedScenarioIds, mockServer.enabledMethods, mockServerStatus?.running]);
}

export function useMockCatalogQuery(running: boolean): void {
  const ui = useMockingUiSnapshot();
  const catalog = useMockCatalog();
  useEffect(() => {
    const input: MockCatalogQuery = {
      text: ui.query,
      status: ui.methodFilter,
      running,
      collapsedProtoIds: [...ui.collapsedProtoIds],
      collapsedServiceIds: [...ui.collapsedServiceIds],
    };
    void mockCatalogStore.query(input);
  }, [
    catalog.generation,
    catalog.syncing,
    running,
    ui.collapsedProtoIds,
    ui.collapsedServiceIds,
    ui.methodFilter,
    ui.query,
  ]);
}
