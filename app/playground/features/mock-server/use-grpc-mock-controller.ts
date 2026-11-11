import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  MockMethodScenarioFile,
  MockServerProject,
} from "../../shared/workbench-types";
import { createDefaultMockServerProject } from "./mock-scenario-model";
import { mockRuntimeStore } from "./runtime/mockRuntime.store";

export function useGrpcMockController() {
  const [mockServer, setMockServerState] = useState<MockServerProject>(() => createDefaultMockServerProject());
  const mockServerStatus = mockRuntimeStore.getGrpc();
  const setMockServerStatus = mockRuntimeStore.patchGrpc;
  const webAccessStatus = mockRuntimeStore.getWebAccess();
  const setWebAccessStatus = mockRuntimeStore.patchWebAccess;
  const mockRuntimeUpdateSeqRef = useRef(0);
  const mockRuntimeAppliedSeqRef = useRef(0);
  const mockServerRef = useRef<MockServerProject>(mockServer);
  const setMockServer = useCallback<Dispatch<SetStateAction<MockServerProject>>>(
    (update) => {
      setMockServerState((current) => {
        const next =
          typeof update === "function" ? (update as (value: MockServerProject) => MockServerProject)(current) : update;
        mockServerRef.current = next;
        return next;
      });
    },
    [],
  );


  return {
    mockServer,
    setMockServer,
    mockServerStatus,
    setMockServerStatus,
    webAccessStatus,
    setWebAccessStatus,














    mockRuntimeUpdateSeqRef,
    mockRuntimeAppliedSeqRef,

    mockServerRef,
  };
}

export type { MockMethodScenarioFile };
