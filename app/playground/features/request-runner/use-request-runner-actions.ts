"use client";

import type {
  ApiCollection,
  ApiCollectionRequest,
  BenchmarkResult,
  EnvironmentConfig,
  HistoryItem,
  RequestSession,
  RestMockProject,
  RestMockScenario,
  RestMockStatus,
  SavedExample,
  WebSocketMockProject,
  WebSocketMockScenario,
  WebSocketMockStatus,
} from "../../shared/workbench-types";
import type { GrpcEvent, GrpcResult, LoadedProto, MetadataPair, RpcMethodInfo } from "@/lib/types";
import type { ManagedWebSocketClient, WebSocketClientState } from "../websocket/use-websocket-controller";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;
type CollectionNamedRequest = ApiCollectionRequest & { collectionName?: string };

type ActionContext = Record<string, any> & {
  collections: ApiCollection[];
  requestSessions: RequestSession[];
  metadata: MetadataPair[];
  environments: EnvironmentConfig[];
  selectedMethod: RpcMethodInfo | null;
  loaded: LoadedProto | null;
  activeCollectionRequest?: CollectionNamedRequest | null;
  activeWebSocketMockScenarios: WebSocketMockScenario[];
  restMockServer: RestMockProject;
  restMockStatus: RestMockStatus;
  setRestMockServer: StateSetter<RestMockProject>;
  setRestMockStatus: StateSetter<RestMockStatus>;
  wsMockServer: WebSocketMockProject;
  wsMockStatus: WebSocketMockStatus;
  setWsMockServer: StateSetter<WebSocketMockProject>;
  setWsMockStatus: StateSetter<WebSocketMockStatus>;
  setHistory: StateSetter<HistoryItem[]>;
  setWsClientState: StateSetter<WebSocketClientState>;
  setWsBenchmarkResults: StateSetter<BenchmarkResult[]>;
  activateRequestSession: (session: RequestSession) => void;
  upsertRequestSessionPreservingOrder: (session: RequestSession) => void;
};

export function useRequestRunnerActions(ctx: ActionContext) {
  const {
    activeBaseUrl,
    activeCollectionRequest,
    activeEnvironmentKey,
    activeNativeTarget,
    activeRequestIdRef,
    activateRequestSession,
    activeRestMockScenario,
    activeSession,
    activeTransportMode,
    activeWebSocketMockResponseText,
    activeWebSocketMockScenario,
    activeWebSocketMockScenarios,
    appendLiveEventToSession,
    assertionJson,
    benchmark,
    calculateBenchmarkStats,
    collections,
    commitTargetDraft,
    createId,
    createRestMockPresetScenario,
    createWebSocketMockScenarioForRequest,
    downloadTextFile,
    evaluateAssertions,
    formatTimestampShort,
    isWebSocketUrl,
    lastResult,
    loaded,
    metadata,
    normalizeRestMockBindHost,
    normalizeRestMockPort,
    normalizeWebSocketMockPath,
    normalizeWebSocketMockPort,
    patchActiveCollectionRequest,
    previewUrl,
    reportPayload,
    requestJson,
    requestRunner,
    requestSessions,
    restMockScenarioId,
    restMockServer,
    restMockStatus,
    safeJsonParse,
    selectCollectionRequest,
    selectedMethod,
    setAssertionResults,
    setError,
    setEvents,
    setHistory,
    setLastResult,
    setMetadata,
    setRequestTab,
    setResponseTab,
    setRestMockScenarioId,
    setRestMockServer,
    setRestMockStatus,
    setTargetDraft,
    setWsBenchmarkResults,
    setWsBenchmarkRunning,
    setWsClientState,
    setWsMockScenarioId,
    setWsMockServer,
    setWsMockStatus,
    showToast,
    slugify,
    targetDraft,
    timestampForFile,
    toErrorMessage,
    updateActiveSession,
    updateRequestSession,
    upsertRequestSessionPreservingOrder,
    wsBenchmarkAbortRef,
    wsBenchmarkIterations,
    wsBenchmarkResults,
    wsBenchmarkRunning,
    wsClientRef,
    wsMockScenarioId,
    wsMockServer,
  } = ctx;

  function selectWebSocketMockScenario(scenarioId: string) {
    setWsMockScenarioId(scenarioId);
    if (activeCollectionRequest?.kind !== "websocket") return;
    setWsMockServer((current) => ({
      ...current,
      selectedScenarioIds: { ...current.selectedScenarioIds, [activeCollectionRequest.id]: scenarioId },
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateActiveWebSocketMockScenario(patch: Partial<WebSocketMockScenario>) {
    if (activeCollectionRequest?.kind !== "websocket") return;
    const scenarioId = activeWebSocketMockScenario?.id ?? wsMockScenarioId;
    setWsMockServer((current) => {
      const payload = buildWebSocketMockPayload(current);
      const scenarios = payload.scenarios.length
        ? payload.scenarios
        : [createWebSocketMockScenarioForRequest(activeCollectionRequest, { id: activeCollectionRequest.id })];
      const hasScenario = scenarios.some((scenario) => scenario.id === scenarioId);
      const fallback = createWebSocketMockScenarioForRequest(activeCollectionRequest, {
        id: activeCollectionRequest.id,
      });
      const targetId = hasScenario ? scenarioId : fallback.id;
      const nextScenarios = (hasScenario ? scenarios : [fallback, ...scenarios]).map((scenario) =>
        scenario.id === targetId ? { ...scenario, ...patch, requestId: activeCollectionRequest.id } : scenario,
      );
      return { ...current, scenarios: nextScenarios, updatedAt: new Date().toISOString() };
    });
  }

  function updateActiveWebSocketMockResponse(value: string) {
    if (activeCollectionRequest?.kind !== "websocket") return;
    updateActiveWebSocketMockScenario({ responseText: value });
    if (activeWebSocketMockScenario?.id === activeCollectionRequest.id || !activeWebSocketMockScenario) {
      patchActiveCollectionRequest({ mockResponse: value });
    }
  }

  function updateWebSocketMockScenario(scenarioId: string, patch: Partial<WebSocketMockScenario>) {
    if (!scenarioId) return;
    setWsMockServer((current) => {
      const payload = buildWebSocketMockPayload(current);
      const nextScenarios = payload.scenarios.map((scenario) =>
        scenario.id === scenarioId ? { ...scenario, ...patch } : scenario,
      );
      return { ...current, scenarios: nextScenarios, updatedAt: new Date().toISOString() };
    });
  }

  function addWebSocketMockScenario() {
    if (activeCollectionRequest?.kind !== "websocket") return;
    const scenario = createWebSocketMockScenarioForRequest(activeCollectionRequest, {
      name: `${activeCollectionRequest.name} scenario ${activeWebSocketMockScenarios.length + 1}`,
    });
    setWsMockScenarioId(scenario.id);
    setWsMockServer((current) => ({
      ...current,
      scenarios: [...buildWebSocketMockPayload(current).scenarios, scenario],
      selectedScenarioIds: { ...current.selectedScenarioIds, [activeCollectionRequest.id]: scenario.id },
      updatedAt: new Date().toISOString(),
    }));
  }

  function openWebSocketMockScenarioFromSidebar(requestId: string | undefined, scenarioId: string) {
    if (requestId) {
      setWsMockServer((current) => ({
        ...current,
        selectedScenarioIds: { ...current.selectedScenarioIds, [requestId]: scenarioId },
        updatedAt: new Date().toISOString(),
      }));
      setWsMockScenarioId(scenarioId);
      for (const collection of collections) {
        const request = collection.requests.find((item) => item.id === requestId && item.kind === "websocket");
        if (request) {
          selectCollectionRequest(collection, request);
          setRequestTab("mock");
          return;
        }
      }
    }
    selectWebSocketMockScenario(scenarioId);
    setRequestTab("mock");
  }

  function handleWebSocketMockPortChange(value: number) {
    const port = normalizeWebSocketMockPort(value);
    setWsMockServer((current) => ({ ...current, port, updatedAt: new Date().toISOString() }));
  }

  async function copyActiveWebSocketMockResponse() {
    try {
      await navigator.clipboard?.writeText(activeWebSocketMockResponseText);
      showToast("WebSocket mock response copied.", "success");
    } catch {
      showToast("Unable to copy WebSocket mock response.", "warning");
    }
  }

  function updateWebSocketSubprotocol(value: string) {
    const next = value.trim() ? [{ key: "Sec-WebSocket-Protocol", value }] : [];
    setMetadata(next);
    updateActiveSession({ metadata: next });
    patchActiveCollectionRequest({ headers: next });
  }

  function buildWebSocketMockPayload(project = wsMockServer): Pick<WebSocketMockProject, "port" | "scenarios"> {
    const wsRequests = collections.flatMap((collection) =>
      collection.requests
        .filter((request) => request.kind === "websocket")
        .map((request) => ({ ...request, collectionName: collection.name })),
    );
    const scenarios: WebSocketMockScenario[] = project.scenarios
      .filter((scenario) => {
        if (!scenario.requestId) return true;
        return wsRequests.some((request) => request.id === scenario.requestId);
      })
      .map((scenario) => ({
        ...scenario,
        path: normalizeWebSocketMockPath(scenario.path),
        intervalMs: Math.max(1, Math.floor(Number(scenario.intervalMs) || 1000)),
        maxLoops: Math.max(0, Math.floor(Number(scenario.maxLoops) || 0)),
        loop: Boolean(scenario.loop),
        streamOnConnect: Boolean(scenario.streamOnConnect),
        sendOnMessage: Boolean(scenario.sendOnMessage),
        matchMode:
          scenario.matchMode === "contains" || scenario.matchMode === "regex" || scenario.matchMode === "jsonPath"
            ? scenario.matchMode
            : "always",
        matchValue: scenario.matchValue ?? "",
        matchJsonPath: scenario.matchJsonPath ?? "",
      }));

    for (const request of wsRequests) {
      const hasScenario = scenarios.some((scenario) => scenario.requestId === request.id || scenario.id === request.id);
      if (!hasScenario) scenarios.push(createWebSocketMockScenarioForRequest(request, { id: request.id }));
    }

    const selectedScenarioIds = project.selectedScenarioIds ?? {};
    scenarios.sort((left, right) => {
      const leftSelected = left.requestId ? selectedScenarioIds[left.requestId] === left.id : false;
      const rightSelected = right.requestId ? selectedScenarioIds[right.requestId] === right.id : false;
      if (leftSelected !== rightSelected) return leftSelected ? -1 : 1;
      return 0;
    });

    return {
      port: normalizeWebSocketMockPort(project.port),
      scenarios,
    };
  }

  function buildRestMockPayload(project = restMockServer) {
    const restRequests = collections.flatMap((collection) =>
      collection.requests
        .filter((request) => request.kind === "rest")
        .map((request) => ({ ...request, collectionName: collection.name })),
    );
    const scenarios: RestMockScenario[] = project.scenarios
      .filter((scenario) => {
        if (!scenario.requestId) return true;
        return restRequests.some((request) => request.id === scenario.requestId);
      })
      .map((scenario) => ({
        ...scenario,
        method: (scenario.method || "GET").toUpperCase(),
        priority: Math.trunc(Number(scenario.priority) || 0),
        status: Math.min(599, Math.max(100, Math.trunc(Number(scenario.status) || 200))),
        delayMs: Math.max(0, Math.trunc(Number(scenario.delayMs) || 0)),
        matchQuery: scenario.matchQuery ?? [],
        matchHeaders: scenario.matchHeaders ?? [],
        matchBodyContains: scenario.matchBodyContains ?? "",
        matchJsonPath: scenario.matchJsonPath ?? "",
        matchJsonEquals: scenario.matchJsonEquals ?? "",
      }));

    for (const request of restRequests) {
      const hasScenario = scenarios.some((scenario) => scenario.requestId === request.id || scenario.id === request.id);
      if (!hasScenario) scenarios.push(createRestMockPresetScenario(request, "success"));
    }

    return {
      port: normalizeRestMockPort(project.port),
      bindHost: normalizeRestMockBindHost(project.bindHost),
      scenarios,
    };
  }

  function updateActiveRestMockScenario(patch: Partial<RestMockScenario>) {
    if (activeCollectionRequest?.kind !== "rest") return;
    const scenarioId = activeRestMockScenario?.id ?? restMockScenarioId;
    setRestMockServer((current) => {
      const payload = buildRestMockPayload(current);
      const scenarios = payload.scenarios.length
        ? payload.scenarios
        : [createRestMockPresetScenario(activeCollectionRequest, "success")];
      const hasScenario = scenarios.some((scenario) => scenario.id === scenarioId);
      const nextScenarios = (
        hasScenario ? scenarios : [createRestMockPresetScenario(activeCollectionRequest, "success"), ...scenarios]
      ).map((scenario) =>
        scenario.id === (hasScenario ? scenarioId : activeCollectionRequest.id)
          ? { ...scenario, ...patch, requestId: activeCollectionRequest.id }
          : scenario,
      );
      return { ...current, scenarios: nextScenarios, updatedAt: new Date().toISOString() };
    });
  }

  function updateActiveRestMockResponse(value: string) {
    if (activeCollectionRequest?.kind !== "rest") return;
    updateActiveRestMockScenario({ body: value });
    if (activeRestMockScenario?.id === activeCollectionRequest.id || !activeRestMockScenario) {
      patchActiveCollectionRequest({ mockResponse: value });
    }
  }

  function addRestMockScenario(preset: "success" | "not-found" | "validation-error" | "delayed") {
    if (activeCollectionRequest?.kind !== "rest") return;
    const scenario = createRestMockPresetScenario(activeCollectionRequest, preset);
    setRestMockScenarioId(scenario.id);
    setRestMockServer((current) => ({
      ...current,
      scenarios: [...buildRestMockPayload(current).scenarios, scenario],
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateRestMockScenarioPair(
    field: "matchQuery" | "matchHeaders",
    index: number,
    pairField: keyof MetadataPair,
    value: string,
  ) {
    const rows: MetadataPair[] = activeRestMockScenario?.[field] ?? [];
    updateActiveRestMockScenario({
      [field]: rows.map((item: MetadataPair, itemIndex: number) =>
        itemIndex === index ? { ...item, [pairField]: value } : item,
      ),
    } as Partial<RestMockScenario>);
  }

  function addRestMockScenarioPair(field: "matchQuery" | "matchHeaders") {
    updateActiveRestMockScenario({
      [field]: [...(activeRestMockScenario?.[field] ?? []), { key: "", value: "" }],
    } as Partial<RestMockScenario>);
  }

  function removeRestMockScenarioPair(field: "matchQuery" | "matchHeaders", index: number) {
    updateActiveRestMockScenario({
      [field]: (activeRestMockScenario?.[field] ?? []).filter(
        (_: MetadataPair, itemIndex: number) => itemIndex !== index,
      ),
    } as Partial<RestMockScenario>);
  }

  function handleRestMockPortChange(value: number) {
    const port = normalizeRestMockPort(value);
    setRestMockServer((current) => ({ ...current, port, updatedAt: new Date().toISOString() }));
  }

  function handleRestMockBindHostChange(value: string) {
    const bindHost = normalizeRestMockBindHost(value);
    setRestMockServer((current) => ({ ...current, bindHost, updatedAt: new Date().toISOString() }));
  }

  async function startRestMockServer() {
    if (!window.electronRestMock?.start) {
      showToast("REST mock server is available in the desktop app only.", "warning");
      return;
    }
    const payload = buildRestMockPayload();
    const result = await window.electronRestMock.start(payload);
    if (!result?.ok) {
      showToast(result?.error || "Unable to start REST mock server.", "error");
      return;
    }
    setRestMockStatus({ running: true, ...result });
    showToast(result.message || "REST mock server started.", "success");
  }

  async function updateRunningRestMockServer() {
    if (!restMockStatus.running || !window.electronRestMock?.update) return;
    const result = await window.electronRestMock.update(buildRestMockPayload());
    if (result?.ok)
      setRestMockStatus((current) => ({ ...current, ...result, running: result.running ?? current.running }));
  }

  async function stopRestMockServer() {
    const result = await window.electronRestMock?.stop?.();
    setRestMockStatus({ running: false, message: result?.message });
    showToast(result?.message || "REST mock server stopped.", "info");
  }

  async function startWebSocketMockServer() {
    const payload = buildWebSocketMockPayload();
    if (!payload.scenarios.length) {
      showToast("Create a WebSocket request before starting a WS mock server.", "warning");
      return;
    }
    if (!window.electronWsMock?.start) {
      showToast("WebSocket mock server is available in the desktop app only.", "warning");
      return;
    }
    const result = await window.electronWsMock.start(payload);
    if (!result?.ok) {
      showToast(result?.error || "Unable to start WebSocket mock server.", "error");
      return;
    }
    setWsMockStatus({ running: true, ...result });
    if (result.port) handleWebSocketMockPortChange(result.port);
    if (activeCollectionRequest?.kind === "websocket") {
      const scenarioUrl = activeWebSocketMockScenario
        ? `ws://127.0.0.1:${result.port ?? wsMockServer.port}${activeWebSocketMockScenario.path}`
        : result.url;
      if (scenarioUrl) {
        setTargetDraft(scenarioUrl);
        updateActiveSession({ baseUrl: scenarioUrl, requestUrl: scenarioUrl });
        patchActiveCollectionRequest({ url: scenarioUrl });
      }
    }
    showToast("WebSocket mock server started.", "success");
  }

  async function stopWebSocketMockServer() {
    if (!window.electronWsMock?.stop) {
      showToast("WebSocket mock server is available in the desktop app only.", "warning");
      return;
    }
    const result = await window.electronWsMock.stop();
    if (!result?.ok) {
      showToast(result?.error || "Unable to stop WebSocket mock server.", "error");
      return;
    }
    setWsMockStatus({ running: false });
    showToast("WebSocket mock server stopped.", "success");
  }

  async function sendWebSocketMockOnce() {
    if (!window.electronWsMock?.send) {
      showToast("WebSocket mock server is available in the desktop app only.", "warning");
      return;
    }
    const result = await window.electronWsMock.send({ scenarioId: activeWebSocketMockScenario?.id });
    if (!result?.ok) {
      showToast(result?.error || "Start the WebSocket mock server before sending a message.", "warning");
      return;
    }
    setWsMockStatus((current) => ({ ...current, ...result, running: result.running ?? current.running }));
    const sent = result.sent ?? 0;
    showToast(
      sent > 0
        ? `Sent mock message to ${sent} WebSocket client(s).`
        : "No mock message was sent. Connect a client or enable Loop after the sequence is finished.",
      sent > 0 ? "success" : "info",
    );
  }

  function webSocketProtocolsFromActiveMetadata() {
    const value = metadata.find((item) => item.key.trim().toLowerCase() === "sec-websocket-protocol")?.value ?? "";
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function buildWebSocketResult(
    client: ManagedWebSocketClient,
    trailers: Record<string, string> = { "grpc-status": "0", "grpc-message": "WebSocket connected" },
  ): GrpcResult {
    const completedAt = new Date();
    return {
      httpStatus: 101,
      headers: { upgrade: "websocket" },
      trailers,
      messages: [...client.messages],
      totalMessages: client.messages.length,
      durationMs: completedAt.getTime() - client.startedAt.getTime(),
      requestUrl: client.url,
      startedAt: client.startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      transport: "websocket",
    };
  }

  function updateWebSocketLiveResult(client: ManagedWebSocketClient) {
    const result = buildWebSocketResult(client);
    const evaluatedAssertions = evaluateAssertions(result, assertionJson);
    if (activeRequestIdRef.current === client.sessionId) {
      setLastResult(result);
      setAssertionResults(evaluatedAssertions);
      setResponseTab("messages");
    }
    updateRequestSession(client.sessionId, {
      lastResult: result,
      assertionResults: evaluatedAssertions,
      responseTab: "messages",
      status: "running",
    });
  }

  function prepareWebSocketClientSession(url: string) {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "websocket") {
      showToast("Select a WebSocket request before sending a message.", "warning");
      return null;
    }
    const now = new Date().toISOString();
    const reusableSession =
      requestSessions.find((session) => session.methodKey === activeCollectionRequest.id) ??
      (activeSession?.methodKey === activeCollectionRequest.id ? activeSession : null);
    const session: RequestSession = {
      id: reusableSession?.id ?? createId(),
      methodKey: activeCollectionRequest.id,
      title: activeCollectionRequest.name,
      serviceName: activeCollectionRequest.collectionName ?? "WebSocket Collection",
      requestJson,
      metadata: metadata.map((item) => ({ ...item })),
      transportMode: "websocket",
      requestKind: "websocket",
      requestUrl: url,
      baseUrl: url,
      nativeTarget: activeNativeTarget,
      environmentKey: activeEnvironmentKey,
      assertionJson,
      responseTab: "messages",
      events: [],
      lastResult: null,
      assertionResults: [],
      running: true,
      status: "running",
      openedAt: reusableSession?.openedAt ?? now,
      updatedAt: now,
    };
    setError("");
    upsertRequestSessionPreservingOrder(session);
    activateRequestSession(session);
    setEvents([]);
    setLastResult(null);
    setAssertionResults([]);
    setResponseTab("messages");
    return session;
  }

  function appendWebSocketEvent(sessionId: string, event: GrpcEvent) {
    appendLiveEventToSession(sessionId, event);
  }

  function closeManualWebSocketClient(reason = "Closed by user", notify = true) {
    const client = wsClientRef.current;
    if (!client) return;
    wsClientRef.current = null;
    try {
      if (client.socket.readyState === WebSocket.OPEN || client.socket.readyState === WebSocket.CONNECTING) {
        client.socket.close(1000, reason);
      }
    } catch {
      // Ignore browser WebSocket close errors.
    }
    setWsClientState((current) => ({ ...current, readyState: "closed" }));
    updateRequestSession(client.sessionId, { running: false, status: "done" });
    if (notify) showToast("WebSocket disconnected.", "info");
  }

  function sendMessageThroughActiveWebSocket(client: ManagedWebSocketClient) {
    const body = requestJson.trim();
    if (!body) {
      showToast("Message body is empty. Add data in the Message tab before sending.", "warning");
      return false;
    }
    client.socket.send(body);
    appendWebSocketEvent(client.sessionId, {
      type: "log",
      level: "info",
      message: "WebSocket message sent",
      details: safeJsonParse(body),
    });
    updateActiveSession({ requestJson: body, requestUrl: client.url, baseUrl: client.url, status: "running" });
    patchActiveCollectionRequest({ body, url: client.url });
    showToast("WebSocket message sent.", "success");
    return true;
  }

  function handleSendWebSocketMessage() {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "websocket") {
      showToast("Select a WebSocket request before sending a message.", "warning");
      return;
    }

    const existing = wsClientRef.current;
    if (
      existing &&
      existing.requestId === activeCollectionRequest.id &&
      existing.socket.readyState === WebSocket.OPEN
    ) {
      sendMessageThroughActiveWebSocket(existing);
      return;
    }

    const url = (targetDraft || activeCollectionRequest.url || activeBaseUrl).trim();
    if (!url || !isWebSocketUrl(url)) {
      showToast("Use a ws:// or wss:// URL before sending a WebSocket message.", "warning");
      return;
    }
    commitTargetDraft(url);

    if (existing) closeManualWebSocketClient("Switching WebSocket request", false);
    const session = prepareWebSocketClientSession(url);
    if (!session) return;

    let socket: WebSocket;
    try {
      const protocols = webSocketProtocolsFromActiveMetadata();
      socket = protocols.length ? new WebSocket(url, protocols) : new WebSocket(url);
    } catch (err) {
      updateRequestSession(session.id, { running: false, status: "error" });
      showToast(toErrorMessage(err), "error");
      return;
    }

    const client: ManagedWebSocketClient = {
      socket,
      sessionId: session.id,
      requestId: activeCollectionRequest.id,
      url,
      startedAt: new Date(),
      messages: [],
    };
    wsClientRef.current = client;
    setWsClientState({ readyState: "connecting", url, sessionId: session.id, messageCount: 0 });
    appendWebSocketEvent(session.id, { type: "log", level: "info", message: "Opening WebSocket", details: { url } });

    socket.onopen = () => {
      appendWebSocketEvent(session.id, {
        type: "headers",
        httpStatus: 101,
        headers: { upgrade: "websocket" },
        contentType: "",
      });
      setWsClientState({ readyState: "open", url, sessionId: session.id, messageCount: client.messages.length });
      sendMessageThroughActiveWebSocket(client);
    };

    socket.onmessage = (event) => {
      const value = safeJsonParse(String(event.data));
      client.messages.push(value);
      appendWebSocketEvent(session.id, { type: "message", index: client.messages.length - 1, value });
      setWsClientState({ readyState: "open", url, sessionId: session.id, messageCount: client.messages.length });
      updateWebSocketLiveResult(client);
    };

    socket.onerror = () => {
      const message = "WebSocket connection failed.";
      appendWebSocketEvent(session.id, { type: "error", message, details: { url } });
      setWsClientState((current) => ({ ...current, readyState: "closed", lastError: message }));
      updateRequestSession(session.id, { running: false, status: "error" });
      showToast(message, "error");
    };

    socket.onclose = (event) => {
      const ok = event.wasClean || client.messages.length > 0 || event.code === 1000;
      const trailers = {
        "grpc-status": ok ? "0" : "2",
        "grpc-message": event.reason || (ok ? "WebSocket closed" : "WebSocket closed unexpectedly"),
        "websocket-code": String(event.code),
      };
      appendWebSocketEvent(session.id, { type: "trailers", trailers });
      const result = buildWebSocketResult(client, trailers);
      const evaluatedAssertions = evaluateAssertions(result, assertionJson);
      if (activeRequestIdRef.current === session.id) {
        setLastResult(result);
        setAssertionResults(evaluatedAssertions);
      }
      updateRequestSession(session.id, {
        lastResult: result,
        assertionResults: evaluatedAssertions,
        running: false,
        status: ok ? "done" : "error",
      });
      const timestamp = new Date().toISOString();
      setHistory((current) =>
        [
          {
            id: createId(),
            method: `${activeCollectionRequest.collectionName ?? "Collection"}/${activeCollectionRequest.name}`,
            status: trailers["grpc-status"],
            durationMs: result.durationMs,
            messageCount: client.messages.length,
            time: formatTimestampShort(timestamp),
            timestamp,
          },
          ...current,
        ].slice(0, 80),
      );
      if (wsClientRef.current?.sessionId === session.id) wsClientRef.current = null;
      setWsClientState({ readyState: "closed", url, sessionId: session.id, messageCount: client.messages.length });
    };
  }

  function exportCurrentBenchmark() {
    if (!selectedMethod) return;
    if (benchmark.results.length === 0) {
      showToast("Run a benchmark before exporting benchmark results.", "warning");
      return;
    }
    const stats = calculateBenchmarkStats(benchmark.results);
    const bundle = {
      kind: "layang-benchmark",
      version: 1,
      exportedAt: new Date().toISOString(),
      method: selectedMethod,
      endpoint: previewUrl,
      transportMode: activeTransportMode,
      requestJson: safeJsonParse(requestJson),
      metadata: metadata.filter((item) => item.key.trim()),
      config: {
        mode: selectedMethod.responseStream ? "streaming" : "unary",
        iterations: benchmark.iterations,
        periodMs: selectedMethod.responseStream ? benchmark.periodMs : undefined,
      },
      stats: {
        total: benchmark.results.length,
        successful: stats.successful.length,
        failed: stats.failed.length,
        averageMs: stats.average,
        fastestMs: stats.fastest,
        slowestMs: stats.slowest,
        p50Ms: stats.p50,
        p95Ms: stats.p95,
        errorRate: stats.errorRate,
      },
      results: benchmark.results,
    };
    downloadTextFile(
      `layang-benchmark-${selectedMethod.methodName}-${timestampForFile()}.json`,
      JSON.stringify(bundle, null, 2),
      "application/json",
    );
  }

  function websocketProtocolsFromMetadataRows(rows: MetadataPair[]): string[] {
    const protocolHeader = rows.find((item) => item.key.trim().toLowerCase() === "sec-websocket-protocol");
    if (!protocolHeader) return [];
    return protocolHeader.value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async function runSingleWebSocketBenchmarkProbe(
    url: string,
    body: string,
    rows: MetadataPair[],
    signal: AbortSignal,
  ): Promise<{ ok: boolean; status: string; durationMs: number; messageCount: number }> {
    const started = performance.now();
    const protocols = websocketProtocolsFromMetadataRows(rows);
    return new Promise((resolve, reject) => {
      let settled = false;
      let opened = false;
      let messageCount = 0;
      let socket: WebSocket | null = null;
      const finish = (ok: boolean, status: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        resolve({ ok, status, durationMs: performance.now() - started, messageCount });
      };
      const abort = () => {
        try {
          socket?.close(1000, "Benchmark stopped");
        } catch {
          // Ignore close errors.
        }
        reject(new DOMException("Aborted", "AbortError"));
      };
      const timeout = window.setTimeout(() => {
        try {
          socket?.close(1000, "Benchmark timeout");
        } catch {
          // Ignore close errors.
        }
        finish(opened || messageCount > 0, messageCount ? "message received" : "open timeout");
      }, 5000);

      try {
        socket = protocols.length ? new WebSocket(url, protocols) : new WebSocket(url);
      } catch (error) {
        window.clearTimeout(timeout);
        reject(error);
        return;
      }

      signal.addEventListener("abort", abort);
      socket.onopen = () => {
        opened = true;
        const payload = body.trim();
        if (payload) socket?.send(payload);
        if (!payload) {
          try {
            socket?.close(1000, "Benchmark open complete");
          } catch {
            // Ignore close errors.
          }
          finish(true, "open");
        }
      };
      socket.onmessage = () => {
        messageCount += 1;
        try {
          socket?.close(1000, "Benchmark sample complete");
        } catch {
          // Ignore close errors.
        }
        finish(true, "message received");
      };
      socket.onerror = () => finish(false, "connection error");
      socket.onclose = (event) =>
        finish(opened || event.wasClean || messageCount > 0, event.reason || `close ${event.code}`);
    });
  }

  async function runWebSocketBenchmark() {
    if (!activeCollectionRequest || activeCollectionRequest.kind !== "websocket" || wsBenchmarkRunning) {
      showToast("Select a WebSocket request before running a benchmark.", "warning");
      return;
    }
    const url = targetDraft.trim();
    if (!url) {
      showToast("WebSocket URL is required.", "warning");
      return;
    }
    const runs = Math.max(1, Math.min(1000, Math.trunc(wsBenchmarkIterations || 1)));
    const abortController = new AbortController();
    wsBenchmarkAbortRef.current = abortController;
    setWsBenchmarkResults([]);
    setWsBenchmarkRunning(true);
    try {
      for (let index = 1; index <= runs; index += 1) {
        if (abortController.signal.aborted) break;
        const timestamp = new Date().toISOString();
        try {
          const result = await runSingleWebSocketBenchmarkProbe(url, requestJson, metadata, abortController.signal);
          setWsBenchmarkResults((current) => [
            ...current,
            {
              id: createId(),
              index,
              status: result.status,
              durationMs: result.durationMs,
              messageCount: result.messageCount,
              ok: result.ok,
              timestamp,
            },
          ]);
        } catch (err) {
          if (abortController.signal.aborted) break;
          setWsBenchmarkResults((current) => [
            ...current,
            {
              id: createId(),
              index,
              status: toErrorMessage(err),
              durationMs: 0,
              messageCount: 0,
              ok: false,
              timestamp,
            },
          ]);
        }
      }
      showToast(
        abortController.signal.aborted ? "WebSocket benchmark stopped." : "WebSocket benchmark finished.",
        abortController.signal.aborted ? "warning" : "success",
      );
    } finally {
      if (wsBenchmarkAbortRef.current === abortController) wsBenchmarkAbortRef.current = null;
      setWsBenchmarkRunning(false);
    }
  }

  function stopWebSocketBenchmark() {
    wsBenchmarkAbortRef.current?.abort();
  }

  function exportWebSocketBenchmark() {
    if (!activeCollectionRequest || wsBenchmarkResults.length === 0) {
      showToast("Run a WebSocket benchmark before exporting benchmark results.", "warning");
      return;
    }
    const stats = calculateBenchmarkStats(wsBenchmarkResults);
    downloadTextFile(
      `layang-ws-benchmark-${slugify(activeCollectionRequest.name)}-${timestampForFile()}.json`,
      JSON.stringify(
        {
          kind: "layang-websocket-benchmark",
          version: 1,
          exportedAt: new Date().toISOString(),
          collection: activeCollectionRequest.collectionName ?? "Collection",
          request: activeCollectionRequest.name,
          endpoint: targetDraft,
          requestMessage: requestJson,
          headers: metadata.filter((item) => item.key.trim()),
          stats: {
            total: wsBenchmarkResults.length,
            successful: stats.successful.length,
            failed: stats.failed.length,
            averageMs: stats.average,
            fastestMs: stats.fastest,
            slowestMs: stats.slowest,
            p50Ms: stats.p50,
            p95Ms: stats.p95,
            errorRate: stats.errorRate,
          },
          latestResponse: lastResult,
          results: wsBenchmarkResults,
        },
        null,
        2,
      ),
      "application/json",
    );
  }

  async function runExample(example: SavedExample) {
    const method = loaded?.methods.find(
      (item) => item.serviceName === example.serviceName && item.methodName === example.methodName,
    );
    let collectionRequest = null as (ApiCollectionRequest & { collectionName?: string }) | null;
    if (!method) {
      for (const collection of collections) {
        const request = collection.requests.find(
          (item) => collection.name === example.serviceName && item.name === example.methodName,
        );
        if (request) {
          collectionRequest = { ...request, collectionName: collection.name };
          break;
        }
      }
    }
    await requestRunner.runRequest({
      overrideMethod: method,
      overrideCollectionRequest: collectionRequest,
      overrideRequestJson: example.requestJson,
      overrideMetadata: example.metadata,
      overrideAssertionJson: example.expectedJson,
    });
  }

  function copyPreviewUrl() {
    navigator.clipboard?.writeText(previewUrl).catch(() => undefined);
  }

  function exportResponse() {
    downloadTextFile(
      `layang-response-${timestampForFile()}.json`,
      JSON.stringify(reportPayload, null, 2),
      "application/json",
    );
  }

  return {
    selectWebSocketMockScenario,
    updateActiveWebSocketMockScenario,
    updateActiveWebSocketMockResponse,
    updateWebSocketMockScenario,
    addWebSocketMockScenario,
    openWebSocketMockScenarioFromSidebar,
    handleWebSocketMockPortChange,
    copyActiveWebSocketMockResponse,
    updateWebSocketSubprotocol,
    buildWebSocketMockPayload,
    buildRestMockPayload,
    updateActiveRestMockScenario,
    updateActiveRestMockResponse,
    addRestMockScenario,
    updateRestMockScenarioPair,
    addRestMockScenarioPair,
    removeRestMockScenarioPair,
    handleRestMockPortChange,
    handleRestMockBindHostChange,
    startRestMockServer,
    updateRunningRestMockServer,
    stopRestMockServer,
    startWebSocketMockServer,
    stopWebSocketMockServer,
    sendWebSocketMockOnce,
    webSocketProtocolsFromActiveMetadata,
    buildWebSocketResult,
    updateWebSocketLiveResult,
    prepareWebSocketClientSession,
    appendWebSocketEvent,
    closeManualWebSocketClient,
    sendMessageThroughActiveWebSocket,
    handleSendWebSocketMessage,
    exportCurrentBenchmark,
    websocketProtocolsFromMetadataRows,
    runSingleWebSocketBenchmarkProbe,
    runWebSocketBenchmark,
    stopWebSocketBenchmark,
    exportWebSocketBenchmark,
    runExample,
    copyPreviewUrl,
    exportResponse,
  };
}
