import type { GrpcResult, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import {
  defaultEnvironments,
  isEnvironmentKey,
  mergeEnvironments as featureMergeEnvironments,
} from "../environments/environment-model";
import { createDefaultMockServerProject, normalizeMockServerProject } from "../mock-server/mock-scenario-model";
import { clamp } from "../../shared/number-utils";
import { safeJsonStringify } from "../../shared/json-utils";
import { createId, savedExampleKey } from "../../shared/entity-utils";
import { methodKey } from "../../shared/rpc-method-utils";
import {
  defaultAssertion,
  defaultMetadata,
  legacyActiveWorkspaceKey,
  legacyProjectStorageKey,
  legacyWorkspaceKey,
  maxJsonBlockChars,
  maxMessagesPerRequest,
  maxPayloadPreviewChars,
  maxSidebarWidth,
  maxStoredEventsPerSession,
  maxStoredMessagesPerResult,
  maxUiEventsPerSession,
  minResponseHeight,
  minSidebarWidth,
  projectStorageKey,
} from "../../shared/workbench-constants";
import type {
  DocResultSnapshot,
  LegacyWorkspace,
  MethodDoc,
  ProjectData,
  RequestSession,
  ResponseTab,
  SavedExample,
  UiEvent,
  WorkspaceLayoutSnapshot,
} from "../../shared/workbench-types";

export function defaultProjectData(): ProjectData {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    transportMode: "grpc-web",
    baseUrl: "http://localhost:9080/grpc/web",
    nativeTarget: "localhost:50051",
    environmentKey: "default",
    environments: defaultEnvironments,
    protoFiles: [],
    selectedMethodKey: "",
    requestJson: "{}",
    metadata: defaultMetadata,
    examples: [],
    methodDocs: [],
    docResults: [],
    assertionJson: defaultAssertion,
    history: [],
    mockServer: createDefaultMockServerProject(),
    requestTabs: [],
    activeRequestId: "",
  };
}

/**
 * Runs non-urgent persistence work during idle time so typing/searching stays responsive.
 */
export function runWhenIdle(callback: () => void) {
  if (typeof globalThis === "undefined") return;
  const idleCallback = (
    globalThis as typeof globalThis & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => void }
  ).requestIdleCallback;
  if (idleCallback) {
    idleCallback(callback, { timeout: 1500 });
    return;
  }
  globalThis.setTimeout(callback, 0);
}

/**
 * Reads and migrates project state from localStorage.
 */
export function readStoredProject(): ProjectData {
  if (typeof window === "undefined") return defaultProjectData();
  try {
    const raw = window.localStorage.getItem(projectStorageKey) ?? window.localStorage.getItem(legacyProjectStorageKey);
    if (raw) return normalizeProjectData(JSON.parse(raw));
  } catch {
    // Fall through to legacy migration.
  }

  try {
    const legacyRaw = window.localStorage.getItem(legacyWorkspaceKey);
    if (!legacyRaw) return defaultProjectData();
    const workspaces = JSON.parse(legacyRaw) as LegacyWorkspace[];
    if (!Array.isArray(workspaces) || workspaces.length === 0) return defaultProjectData();
    const activeId = window.localStorage.getItem(legacyActiveWorkspaceKey);
    const active = workspaces.find((workspace) => workspace.id === activeId) ?? workspaces[0];
    const project = normalizeProjectData(active);
    window.localStorage.setItem(projectStorageKey, JSON.stringify(project));
    return project;
  } catch {
    return defaultProjectData();
  }
}

/**
 * Normalizes persisted or legacy project payloads into the current project schema.
 */
export function normalizeProjectData(input: Partial<ProjectData> | LegacyWorkspace | undefined | null): ProjectData {
  const defaults = defaultProjectData();
  const data = input ?? {};
  const normalizedTabs = Array.isArray((data as ProjectData).requestTabs)
    ? dedupeRequestSessions((data as ProjectData).requestTabs.map(normalizeRequestSession))
    : [];
  const activeRequestId =
    typeof (data as ProjectData).activeRequestId === "string" &&
    normalizedTabs.some((tab) => tab.id === (data as ProjectData).activeRequestId)
      ? (data as ProjectData).activeRequestId
      : (normalizedTabs[0]?.id ?? "");
  return {
    ...defaults,
    ...data,
    version: 2,
    updatedAt: data.updatedAt ?? new Date().toISOString(),
    environmentKey: isEnvironmentKey((data as ProjectData).environmentKey)
      ? (data as ProjectData).environmentKey
      : "default",
    environments: featureMergeEnvironments((data as ProjectData).environments),
    protoFiles: Array.isArray(data.protoFiles) ? data.protoFiles : [],
    metadata: Array.isArray(data.metadata) ? data.metadata : defaultMetadata,
    examples: Array.isArray(data.examples) ? data.examples : [],
    methodDocs: Array.isArray((data as ProjectData).methodDocs)
      ? (data as ProjectData).methodDocs.filter(isMethodDoc)
      : [],
    docResults: Array.isArray((data as ProjectData).docResults)
      ? (data as ProjectData).docResults.filter(isDocResultSnapshot)
      : [],
    history: Array.isArray(data.history) ? data.history : [],
    mockServer: normalizeMockServerProject((data as ProjectData).mockServer),
    requestTabs: normalizedTabs,
    activeRequestId,
    transportMode: data.transportMode === "native-grpc" ? "native-grpc" : "grpc-web",
    baseUrl: data.baseUrl ?? defaults.baseUrl,
    nativeTarget: data.nativeTarget ?? defaults.nativeTarget,
    selectedMethodKey: data.selectedMethodKey ?? "",
    requestJson: data.requestJson ?? "{}",
    assertionJson: data.assertionJson ?? defaultAssertion,
  };
}

/**
 * Checks whether a JSON object looks like a serialized Layang project payload.
 */
export function looksLikeProjectData(value: unknown): value is Partial<ProjectData> {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ProjectData>;
  return (
    Array.isArray(record.protoFiles) ||
    Array.isArray(record.environments) ||
    Array.isArray(record.requestTabs) ||
    Array.isArray(record.examples) ||
    Array.isArray(record.methodDocs) ||
    typeof record.mockServer === "object" ||
    typeof record.baseUrl === "string" ||
    typeof record.nativeTarget === "string"
  );
}

/**
 * Applies imported workspace layout values while clamping resizable panels to safe limits.
 */
export function applyWorkspaceLayoutSnapshot(
  snapshot: Partial<WorkspaceLayoutSnapshot>,
  setters: {
    setSidebarOpen: (value: boolean) => void;
    setSidebarWidthPx: (value: number) => void;
    setResponseHeight: (value: number) => void;
  },
) {
  if (typeof snapshot.sidebarOpen === "boolean") setters.setSidebarOpen(snapshot.sidebarOpen);
  if (typeof snapshot.sidebarWidthPx === "number")
    setters.setSidebarWidthPx(clamp(snapshot.sidebarWidthPx, minSidebarWidth, maxSidebarWidth));
  if (typeof snapshot.responseHeight === "number")
    setters.setResponseHeight(Math.max(minResponseHeight, snapshot.responseHeight));
}

/**
 * Merges method documentation publish metadata by method key.
 */
export function mergeMethodDocs(current: MethodDoc[], incoming: MethodDoc[]): MethodDoc[] {
  const byKey = new Map<string, MethodDoc>();
  for (const doc of current) byKey.set(doc.methodKey, doc);
  for (const doc of incoming) {
    byKey.set(doc.methodKey, {
      ...doc,
      published: Boolean(doc.published),
      updatedAt: doc.updatedAt || new Date().toISOString(),
    });
  }
  return Array.from(byKey.values()).slice(0, 500);
}

/**
 * Merges saved documentation response snapshots by method key, keeping the newest imported value.
 */
export function mergeDocResults(current: DocResultSnapshot[], incoming: DocResultSnapshot[]): DocResultSnapshot[] {
  const byKey = new Map<string, DocResultSnapshot>();
  for (const result of current) byKey.set(result.methodKey, result);
  for (const result of incoming) {
    byKey.set(result.methodKey, {
      ...result,
      savedAt: result.savedAt || new Date().toISOString(),
      result: compactGrpcResultForStorage(result.result),
    });
  }
  return Array.from(byKey.values()).slice(0, 500);
}

/**
 * Keeps only one tab per service/method pair while preserving the newest session.
 */
export function dedupeRequestSessions(sessions: RequestSession[]): RequestSession[] {
  const seen = new Set<string>();
  const output: RequestSession[] = [];
  for (const session of sessions) {
    if (!session.methodKey || seen.has(session.methodKey)) continue;
    seen.add(session.methodKey);
    output.push(session);
  }
  return output;
}

/**
 * Maps hidden/deprecated response tabs to visible tabs.
 */
export function normalizeVisibleResponseTab(tab: ResponseTab | undefined): ResponseTab {
  return tab === "raw" || tab === "history" || tab === "report" ? tab : "messages";
}

/**
 * Normalizes a request tab loaded from persisted state.
 */
export function normalizeRequestSession(session: RequestSession): RequestSession {
  return {
    ...session,
    metadata: Array.isArray(session.metadata) ? session.metadata : [],
    transportMode: session.transportMode === "native-grpc" ? "native-grpc" : "grpc-web",
    baseUrl: session.baseUrl ?? "http://localhost:9080/grpc/web",
    nativeTarget: session.nativeTarget ?? "localhost:50051",
    environmentKey: isEnvironmentKey(session.environmentKey) ? session.environmentKey : "default",
    assertionJson: session.assertionJson ?? defaultAssertion,
    events: Array.isArray(session.events) ? session.events.slice(-maxUiEventsPerSession).map(compactUiEvent) : [],
    lastResult: session.lastResult ? compactGrpcResultForClient(session.lastResult) : null,
    assertionResults: Array.isArray(session.assertionResults) ? session.assertionResults : [],
    responseTab: normalizeVisibleResponseTab(session.responseTab),
    running: false,
    status:
      session.status === "done" || session.status === "error" || session.status === "cancelled"
        ? session.status
        : "idle",
  };
}

/**
 * Appends a UI event while respecting the client-side event cap.
 */
export function appendLimitedUiEvent(events: UiEvent[], event: UiEvent): UiEvent[] {
  const next = [...events, event].slice(-maxUiEventsPerSession);
  let keptMessages = 0;
  const kept: UiEvent[] = [];

  for (let index = next.length - 1; index >= 0; index -= 1) {
    const item = next[index];
    if (item.kind === "message") {
      if (keptMessages >= maxMessagesPerRequest) continue;
      keptMessages += 1;
    }
    kept.push(item);
  }

  return kept.reverse();
}

/**
 * Compacts a request tab before saving it to localStorage.
 */
export function compactRequestSessionForStorage(session: RequestSession): RequestSession {
  return {
    ...session,
    running: false,
    status: session.status === "running" ? "cancelled" : session.status,
    events: session.events.slice(-maxStoredEventsPerSession).map(compactUiEvent),
    lastResult: session.lastResult ? compactGrpcResultForStorage(session.lastResult) : null,
  };
}

/**
 * Compacts gRPC results before storing them in live React state.
 */
export function compactGrpcResultForClient(result: GrpcResult): GrpcResult {
  return {
    ...result,
    messages: result.messages.slice(-maxMessagesPerRequest).map(compactPayload),
  };
}

/**
 * Compacts gRPC results more aggressively for localStorage.
 */
export function compactGrpcResultForStorage(result: GrpcResult): GrpcResult {
  return {
    ...result,
    messages: result.messages.slice(-maxStoredMessagesPerResult).map(compactPayload),
  };
}

/**
 * Compacts a UI event payload for client display/storage.
 */
export function compactUiEvent(event: UiEvent): UiEvent {
  return { ...event, payload: compactPayload(event.payload) };
}

/**
 * Truncates large nested payloads so the browser stays responsive.
 */
export function compactPayload(value: unknown): unknown {
  const serialized = safeJsonStringify(value);
  if (serialized.length <= maxPayloadPreviewChars) return value;

  return {
    truncated: true,
    originalType: Array.isArray(value) ? "array" : typeof value,
    originalChars: serialized.length,
    preview: serialized.slice(0, maxPayloadPreviewChars),
  };
}

/**
 * Returns the total response message count from a gRPC result.
 */
export function getResultMessageCount(result: GrpcResult): number {
  return typeof result.totalMessages === "number" ? result.totalMessages : result.messages.length;
}

/**
 * Formats a value for display in JSON/code blocks.
 */
export function safePrettyJson(value: unknown): string {
  const text = safeJsonStringify(value, 2);
  if (text.length <= maxJsonBlockChars) return text;
  return `${text.slice(0, maxJsonBlockChars)}
... truncated ${text.length - maxJsonBlockChars} chars for UI performance`;
}

/**
 * Builds a compact one-line preview of an event payload.
 */
export function oneLinePreview(value: unknown): string {
  const text = safeJsonStringify(value);
  if (text.length <= maxPayloadPreviewChars) return text;
  return `${text.slice(0, maxPayloadPreviewChars)}...`;
}

/**
 * Merges proto files while keeping changed duplicate names as copy files.
 */
export function mergeProtoFiles(current: ProtoSourceFile[], incoming: ProtoSourceFile[]): ProtoSourceFile[] {
  const output = [...current];
  const existingKeys = new Set(output.map((file) => `${file.name}\n${file.text}`));
  const existingNames = new Set(output.map((file) => file.name));

  for (const file of incoming) {
    const exactKey = `${file.name}\n${file.text}`;
    if (existingKeys.has(exactKey)) continue;

    let nextName = file.name;
    if (existingNames.has(nextName)) {
      const dotIndex = file.name.lastIndexOf(".");
      const base = dotIndex > 0 ? file.name.slice(0, dotIndex) : file.name;
      const ext = dotIndex > 0 ? file.name.slice(dotIndex) : "";
      let copy = 2;
      while (existingNames.has(nextName)) {
        nextName = `${base} copy ${copy}${ext}`;
        copy += 1;
      }
    }

    const nextFile = { ...file, name: nextName };
    output.push(nextFile);
    existingKeys.add(`${nextFile.name}\n${nextFile.text}`);
    existingNames.add(nextFile.name);
  }

  return output.sort((a, b) => a.name.localeCompare(b.name));
}

export function isProtoSourceFile(value: unknown): value is ProtoSourceFile {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as ProtoSourceFile).name === "string" &&
      typeof (value as ProtoSourceFile).text === "string",
  );
}

/**
 * Validates a saved example payload.
 */
export function isSavedExample(value: unknown): value is SavedExample {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as SavedExample).serviceName === "string" &&
      typeof (value as SavedExample).methodName === "string" &&
      typeof (value as SavedExample).requestJson === "string",
  );
}

/**
 * Validates a method documentation payload.
 */
export function isMethodDoc(value: unknown): value is MethodDoc {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as MethodDoc).methodKey === "string" &&
      typeof (value as MethodDoc).serviceName === "string" &&
      typeof (value as MethodDoc).methodName === "string",
  );
}

/**
 * Validates a saved response snapshot used by generated docs.
 */
export function isDocResultSnapshot(value: unknown): value is DocResultSnapshot {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as DocResultSnapshot).methodKey === "string" &&
      Boolean((value as DocResultSnapshot).result),
  );
}

/**
 * Merges saved examples while avoiding duplicates.
 */
export function mergeExamples(current: SavedExample[], incoming: SavedExample[]): SavedExample[] {
  const seen = new Set(current.map((item) => `${savedExampleKey(item)}:${item.name}:${item.requestJson}`));
  const output = [...current];
  for (const example of incoming) {
    const normalized = {
      ...example,
      id: example.id || createId(),
      createdAt: example.createdAt || new Date().toISOString(),
    };
    const key = `${savedExampleKey(normalized)}:${normalized.name}:${normalized.requestJson}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.unshift(normalized);
  }
  return output.slice(0, 300);
}

/**
 * Inserts or replaces one method documentation entry.
 */
export function upsertMethodDoc(current: MethodDoc[], next: MethodDoc): MethodDoc[] {
  const without = current.filter((doc) => doc.methodKey !== next.methodKey);
  return [{ ...next, updatedAt: next.updatedAt || new Date().toISOString() }, ...without].slice(0, 500);
}

/**
 * Returns a saved method doc or a generated starter markdown document.
 */
export function getOrCreateMethodDoc(docs: MethodDoc[], method: RpcMethodInfo | null): MethodDoc | null {
  if (!method) return null;
  const key = methodKey(method);
  return (
    docs.find((doc) => doc.methodKey === key) ?? {
      methodKey: key,
      serviceName: method.serviceName,
      methodName: method.methodName,
      published: false,
      updatedAt: new Date().toISOString(),
    }
  );
}

/**
 * Returns the most recent stored response per method from open/restored request tabs.
 */
