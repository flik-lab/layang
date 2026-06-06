import { useState } from "react";
import type { RestMockProject, RestMockStatus } from "../../shared/workbench-types";
import { createDefaultRestMockProject } from "../workspace/workspace-model";

export function useRestController() {
  const [restMockServer, setRestMockServer] = useState<RestMockProject>(() => createDefaultRestMockProject());
  const [restMockStatus, setRestMockStatus] = useState<RestMockStatus>({ running: false });
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
