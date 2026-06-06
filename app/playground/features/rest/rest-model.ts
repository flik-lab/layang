import type {
  ApiCollection,
  ApiCollectionRequest,
  RestAuthConfig,
  RestMockProject,
  RestMockScenario,
} from "../../shared/workbench-types";
import type { GrpcResult } from "@/lib/types";
import { createId } from "../../shared/entity-utils";
import { normalizeRestMockBindHost, normalizeRestMockPort } from "../workspace/workspace-model";

export const restMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export function defaultRestMockResponse(name = "REST Request") {
  return JSON.stringify({ ok: true, request: name, timestamp: "{{now}}" }, null, 2);
}

export function restRequestPath(request: Pick<ApiCollectionRequest, "url">) {
  try {
    return new URL(request.url || "http://localhost", "http://localhost").pathname || "/";
  } catch {
    return request.url.startsWith("/") ? request.url : "/";
  }
}

export function createRestMockScenarioForRequest(
  request: ApiCollectionRequest & { collectionName?: string },
  overrides: Partial<RestMockScenario> = {},
): RestMockScenario {
  const path = restRequestPath(request);
  return {
    id: overrides.id ?? createId(),
    name: overrides.name ?? `${request.name} success`,
    enabled: overrides.enabled ?? true,
    method: overrides.method ?? request.method ?? "GET",
    path: overrides.path ?? path,
    priority: overrides.priority ?? 0,
    status: overrides.status ?? 200,
    headers: overrides.headers ?? [{ key: "content-type", value: "application/json" }],
    body: overrides.body ?? request.mockResponse ?? defaultRestMockResponse(request.name),
    delayMs: overrides.delayMs ?? 0,
    matchQuery: overrides.matchQuery ?? [],
    matchHeaders: overrides.matchHeaders ?? [],
    matchBodyContains: overrides.matchBodyContains ?? "",
    matchJsonPath: overrides.matchJsonPath ?? "",
    matchJsonEquals: overrides.matchJsonEquals ?? "",
    ...overrides,
    requestId: overrides.requestId ?? request.id,
  };
}

export function createRestMockPresetScenario(
  request: ApiCollectionRequest & { collectionName?: string },
  preset: "success" | "not-found" | "validation-error" | "delayed",
): RestMockScenario {
  if (preset === "not-found") {
    return createRestMockScenarioForRequest(request, {
      name: `${request.name} not found`,
      priority: 20,
      status: 404,
      body: JSON.stringify({ error: "Not found", id: "{{request.path.id}}", timestamp: "{{now}}" }, null, 2),
    });
  }
  if (preset === "validation-error") {
    return createRestMockScenarioForRequest(request, {
      name: `${request.name} validation error`,
      priority: 30,
      status: 422,
      matchJsonPath: "$.invalid",
      matchJsonEquals: "true",
      body: JSON.stringify({ error: "Validation failed", field: "invalid", timestamp: "{{now}}" }, null, 2),
    });
  }
  if (preset === "delayed") {
    return createRestMockScenarioForRequest(request, {
      name: `${request.name} delayed success`,
      priority: 10,
      delayMs: 750,
      body: JSON.stringify({ ok: true, delayed: true, request: request.name, timestamp: "{{now}}" }, null, 2),
    });
  }
  return createRestMockScenarioForRequest(request, { id: request.id, name: `${request.name} success` });
}

export function restDocKey(request: Pick<ApiCollectionRequest, "id"> | null | undefined) {
  return request?.id ? `rest:${request.id}` : "";
}

export function findRestRequestForDocKey(collections: ApiCollection[], key: string) {
  const requestId = key.startsWith("rest:") ? key.slice(5) : key;
  for (const collection of collections) {
    const request = collection.requests.find((item) => item.id === requestId && item.kind === "rest");
    if (request) return { ...request, collectionName: collection.name };
  }
  return null;
}

export function defaultRestAuth(): RestAuthConfig {
  return { type: "none" };
}

export function buildRestRequestUrl(request: ApiCollectionRequest, fallbackBaseUrl: string) {
  let url = (request.url || fallbackBaseUrl || "http://127.0.0.1:3000").trim();
  for (const param of request.restPathParams ?? []) {
    const key = param.key.trim();
    if (!key) continue;
    const encodedValue = encodeURIComponent(param.value);
    url = url.replaceAll(`:${key}`, encodedValue).replaceAll(`{${key}}`, encodedValue);
  }

  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    for (const param of request.restParams ?? []) {
      const key = param.key.trim();
      if (key) parsed.searchParams.set(key, param.value);
    }
    const auth = request.restAuth ?? defaultRestAuth();
    if (auth.type === "api-key" && auth.in === "query" && auth.key.trim()) {
      parsed.searchParams.set(auth.key.trim(), auth.value);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function renderRestDocsMarkdown({
  collectionRequest,
  url,
  latestResult,
}: {
  collectionRequest: ApiCollectionRequest & { collectionName?: string };
  url: string;
  latestResult: GrpcResult | null;
}) {
  const method = collectionRequest.method ?? "GET";
  const headers = (collectionRequest.headers ?? []).filter((item) => item.key.trim());
  const query = (collectionRequest.restParams ?? []).filter((item) => item.key.trim());
  const path = (collectionRequest.restPathParams ?? []).filter((item) => item.key.trim());
  return [
    `# ${method} ${collectionRequest.name}`,
    "",
    `Collection: ${collectionRequest.collectionName ?? "Collection"}`,
    "",
    "## Request",
    "",
    `- Method: \`${method}\``,
    `- URL: \`${url}\``,
    `- Body type: \`${collectionRequest.restBodyType ?? "json"}\``,
    `- Auth: \`${collectionRequest.restAuth?.type ?? "none"}\``,
    "",
    path.length ? "## Path params" : "",
    ...path.map((item) => `- \`${item.key}\`: \`${item.value}\``),
    path.length ? "" : "",
    query.length ? "## Query params" : "",
    ...query.map((item) => `- \`${item.key}\`: \`${item.value}\``),
    query.length ? "" : "",
    headers.length ? "## Headers" : "",
    ...headers.map((item) => `- \`${item.key}\`: \`${item.value}\``),
    headers.length ? "" : "",
    collectionRequest.body.trim() ? "## Body" : "",
    collectionRequest.body.trim() ? "```json" : "",
    collectionRequest.body.trim() ? collectionRequest.body.trim() : "",
    collectionRequest.body.trim() ? "```" : "",
    latestResult ? "" : "",
    latestResult ? "## Latest response" : "",
    latestResult ? `- HTTP status: \`${latestResult.httpStatus ?? "unknown"}\`` : "",
    latestResult ? `- Duration: \`${latestResult.durationMs}ms\`` : "",
  ]
    .filter((line, index, lines) => line || lines[index - 1])
    .join("\n");
}

export function buildRestMockPayload(project: RestMockProject): RestMockProject {
  return {
    ...project,
    port: normalizeRestMockPort(project.port),
    bindHost: normalizeRestMockBindHost(project.bindHost),
    scenarios: project.scenarios.map((scenario) => ({
      ...scenario,
      path: scenario.path || "/",
      priority: Math.floor(Number(scenario.priority) || 0),
      status: Math.floor(Number(scenario.status) || 200),
      delayMs: Math.max(0, Math.floor(Number(scenario.delayMs) || 0)),
    })),
  };
}
