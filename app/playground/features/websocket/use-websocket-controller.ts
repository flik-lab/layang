import { useRef, useState } from "react";
import type { BenchmarkResult, WebSocketMockProject, WebSocketMockStatus } from "../../shared/workbench-types";
import { createDefaultWebSocketMockProject } from "../workspace/workspace-model";

export type WebSocketClientState = {
  readyState: "closed" | "connecting" | "open";
  url: string;
  sessionId: string;
  messageCount: number;
  lastError?: string;
};

export type ManagedWebSocketClient = {
  socket: WebSocket;
  sessionId: string;
  requestId: string;
  url: string;
  startedAt: Date;
  messages: unknown[];
};

export function useWebSocketController() {
  const [wsMockServer, setWsMockServer] = useState<WebSocketMockProject>(() => createDefaultWebSocketMockProject());
  const [wsMockScenarioId, setWsMockScenarioId] = useState("");
  const [wsBenchmarkIterations, setWsBenchmarkIterations] = useState(5);
  const [wsBenchmarkResults, setWsBenchmarkResults] = useState<BenchmarkResult[]>([]);
  const [wsBenchmarkRunning, setWsBenchmarkRunning] = useState(false);
  const [wsMockStatus, setWsMockStatus] = useState<WebSocketMockStatus>({ running: false });
  const wsClientRef = useRef<ManagedWebSocketClient | null>(null);
  const [wsClientState, setWsClientState] = useState<WebSocketClientState>({
    readyState: "closed",
    url: "",
    sessionId: "",
    messageCount: 0,
  });
  const wsBenchmarkAbortRef = useRef<AbortController | null>(null);

  return {
    wsMockServer,
    setWsMockServer,
    wsMockScenarioId,
    setWsMockScenarioId,
    wsBenchmarkIterations,
    setWsBenchmarkIterations,
    wsBenchmarkResults,
    setWsBenchmarkResults,
    wsBenchmarkRunning,
    setWsBenchmarkRunning,
    wsMockStatus,
    setWsMockStatus,
    wsClientRef,
    wsClientState,
    setWsClientState,
    wsBenchmarkAbortRef,
  };
}
