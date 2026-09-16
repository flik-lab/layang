import { useState } from "react";
import type { RestMockProject } from "../../shared/workbench-types";
import { createDefaultRestMockProject } from "../workspace/workspace-model";
import { mockRuntimeStore } from "../mock-server/runtime/mockRuntime.store";

export function useRestController() {
  const [restMockServer, setRestMockServer] = useState<RestMockProject>(() => createDefaultRestMockProject());
  const restMockStatus = mockRuntimeStore.getRest();
  const setRestMockStatus = mockRuntimeStore.patchRest;
  const [restMockScenarioId, setRestMockScenarioId] = useState("");

  return {
    restMockServer,
    setRestMockServer,
    restMockStatus,
    setRestMockStatus,
    restMockScenarioId,
    setRestMockScenarioId,
  };
}
