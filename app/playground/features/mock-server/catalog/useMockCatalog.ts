"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ProtoRuntimeRegistry } from "@/lib/proto-runtime-registry";
import type { MockServerProject, MockServerStatus } from "../../../shared/workbench-types";
import { buildMockCatalogSourceSnapshot, type MockCatalogSourceSnapshot } from "./mockCatalogRuntime";
import { mockCatalogStore } from "./mockCatalog.store";
import type { MockCatalogQuery } from "./mockCatalog.types";
import { useMockingUiSnapshot } from "../workspace/mockingUi.store";
import { useScenarioIndex } from "./useScenarioIndex";

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
  workspaceKey?: string;
  enabled?: boolean;
}): void {
  const { mockServer, mockServerStatus, protoRuntimeRegistry,
    workspaceKey = "", enabled = true } = options;
  const { items, phase } = useScenarioIndex(enabled && workspaceKey !== "unsaved" ? workspaceKey : "");
  const [protoSource, setProtoSource] = useState<{
    workspaceKey: string;
    sources: MockServerProject["protoSources"];
    registry: ProtoRuntimeRegistry;
    snapshot: MockCatalogSourceSnapshot;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    void buildMockCatalogSourceSnapshot(mockServer, protoRuntimeRegistry, abort.signal).then(snapshot => {
      if (!abort.signal.aborted) {
        setProtoSource({ workspaceKey, sources: mockServer.protoSources, registry: protoRuntimeRegistry, snapshot });
      }
    }).catch(error => {
      if (!abort.signal.aborted) console.error("Mock Proto index failed.", error);
    });
    return () => abort.abort();
  }, [enabled, workspaceKey, mockServer.protoSources, protoRuntimeRegistry]);

  const indexedItems = phase === "partial" ? null : items;
  useEffect(() => {
    if (!enabled || !protoSource || protoSource.workspaceKey !== workspaceKey ||
        protoSource.sources !== mockServer.protoSources || protoSource.registry !== protoRuntimeRegistry) return;
    const { methods, scenarioFiles } = protoSource.snapshot;
    const counts = new Map<string, number>();
    // Keep the sidebar index stable while the scenario editor displays cold batches.
    for (const item of indexedItems ?? []) {
      counts.set(item.methodKey, (counts.get(item.methodKey) || 0) + 1);
    }
    const sourceKeys = new Map(methods.map(method => [
      method.methodId, `${method.serviceName}/${method.methodName}`,
    ]));
    void mockCatalogStore.syncSource({ methods, sourceId: workspaceKey, scenarioFiles: scenarioFiles.map(file => {
      const count = counts.get(sourceKeys.get(file.methodId) || "") || 0;
      return {
        ...file,
        scenarioCount: count,
        revision: String(count),
      };
    }) }).catch(error => console.error("Mock catalog source sync failed.", error));
  }, [enabled, workspaceKey, mockServer.protoSources, protoRuntimeRegistry, protoSource,
    indexedItems]);

  useEffect(() => {
    if (!enabled) return;
    void mockCatalogStore.updateRuntime({
      selectedScenarioIds: mockServer.selectedScenarioIds,
      enabledMethods: mockServer.enabledMethods,
      running: Boolean(mockServerStatus?.running),
    }).catch((error: unknown) => {
      console.error("Mock catalog runtime sync failed.", error);
    });
  }, [enabled, workspaceKey, mockServer.selectedScenarioIds, mockServer.enabledMethods, mockServerStatus?.running]);
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
