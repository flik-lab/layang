import type {
  ApiCollection,
  ApiCollectionRequest,
  WebSocketMockProject,
  WebSocketMockScenario,
} from "../../shared/workbench-types";
import { createId } from "../../shared/entity-utils";

export function webSocketDocKey(request: Pick<ApiCollectionRequest, "id"> | null | undefined) {
  return request?.id ? `ws:${request.id}` : "";
}

export function findWebSocketRequestForDocKey(collections: ApiCollection[], key: string) {
  const requestId = key.startsWith("ws:") ? key.slice(3) : key;
  for (const collection of collections) {
    const request = collection.requests.find((item) => item.id === requestId && item.kind === "websocket");
    if (request) return { ...request, collectionName: collection.name };
  }
  return null;
}

export function isWebSocketUrl(value?: string) {
  return /^wss?:\/\//i.test((value ?? "").trim());
}

export function defaultWebSocketMockResponse(name = "WebSocket Request") {
  return JSON.stringify(
    [
      {
        type: "message",
        request: name,
        count: "{{count}}",
        message: "Hello from mock WebSocket",
        incomingMethod: "{{incoming.method}}",
        requestId: "{{uuid}}",
        timestamp: "{{now}}",
      },
      {
        type: "message",
        request: name,
        count: "{{count}}",
        message: "Second mock WebSocket message",
        timestamp: "{{now}}",
      },
    ],
    null,
    2,
  );
}

export function webSocketRequestPath(request: Pick<ApiCollectionRequest, "url"> | null | undefined) {
  if (!request?.url) return "/mock/ws";
  try {
    return new URL(request.url, "ws://localhost").pathname || "/mock/ws";
  } catch {
    return request.url.startsWith("/") ? request.url.split(/[?#]/)[0] || "/mock/ws" : "/mock/ws";
  }
}

export function createWebSocketMockScenarioForRequest(
  request: ApiCollectionRequest & { collectionName?: string },
  overrides: Partial<WebSocketMockScenario> = {},
): WebSocketMockScenario {
  return {
    id: overrides.id ?? createId(),
    requestId: overrides.requestId ?? request.id,
    name: overrides.name ?? `${request.name} scenario`,
    enabled: overrides.enabled ?? true,
    path: overrides.path ?? webSocketRequestPath(request),
    responseText: overrides.responseText ?? request.mockResponse ?? defaultWebSocketMockResponse(request.name),
    intervalMs: Math.max(1, Math.floor(Number(overrides.intervalMs) || 1000)),
    loop: overrides.loop ?? false,
    maxLoops: Math.max(0, Math.floor(Number(overrides.maxLoops) || 0)),
    streamOnConnect: overrides.streamOnConnect ?? false,
    sendOnMessage: overrides.sendOnMessage ?? false,
    matchMode: overrides.matchMode ?? "always",
    matchValue: overrides.matchValue ?? "",
    matchJsonPath: overrides.matchJsonPath ?? "$.method",
  };
}

export function normalizeWebSocketMockPath(value: string) {
  const path = (value || "/mock/ws").split(/[?#]/)[0].trim() || "/mock/ws";
  return path.startsWith("/") ? path : `/${path}`;
}

export function buildWebSocketMockPayload(project: WebSocketMockProject): WebSocketMockProject {
  return {
    ...project,
    port: Math.max(1, Math.min(65535, Math.floor(Number(project.port) || 8081))),
    scenarios: project.scenarios.map((scenario) => ({
      ...scenario,
      path: normalizeWebSocketMockPath(scenario.path),
      intervalMs: Math.max(1, Math.floor(Number(scenario.intervalMs) || 1000)),
      maxLoops: Math.max(0, Math.floor(Number(scenario.maxLoops) || 0)),
    })),
  };
}
