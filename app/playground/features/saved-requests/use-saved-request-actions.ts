"use client";

import type { MetadataPair } from "@/lib/types";
import type {
  ApiRequestKind,
  RequestSession,
  SavedRequest,
  SavedRequestSnapshot,
} from "../../shared/workbench-types";

function createSavedRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `saved-request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneMetadata(rows: MetadataPair[] | undefined): MetadataPair[] {
  return Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
}

function activeRequestKind(scope: any): ApiRequestKind | null {
  if (scope.activeCollectionRequest?.kind === "grpc" || scope.activeCollectionRequest?.kind === "rest" || scope.activeCollectionRequest?.kind === "websocket") {
    return scope.activeCollectionRequest.kind;
  }
  if (scope.activeSession?.requestKind === "grpc" || scope.activeSession?.requestKind === "rest" || scope.activeSession?.requestKind === "websocket") {
    return scope.activeSession.requestKind;
  }
  return scope.selectedMethod ? "grpc" : null;
}

export function useSavedRequestActions(scope: any) {
  const {
    activeBaseUrl,
    activeCollectionRequest,
    activeEnvironmentKey,
    activeNativeTarget,
    activeSession,
    activeTransportMode,
    assertionJson,
    metadata,
    getRequestJsonDraft,
    patchActiveCollectionRequest,
    protoRuntimeRegistry,
    requestJson,
    savedRequests,
    selectedMethod,
    setActiveProtoLibraryId,
    setActiveProtoVersionId,
    setAssertionJson,
    setBaseUrl,
    setEnvironmentKey,
    setLoaded,
    setMetadata,
    setNativeTarget,
    setRequestJson,
    setSavedRequests,
    setSelectedMethodKey,
    setTargetDraft,
    setTransportMode,
    showToast,
    targetDraft,
    updateActiveSession,
  } = scope;

  function buildCurrentSavedRequestSnapshot(): SavedRequestSnapshot | null {
    const kind = activeRequestKind(scope);
    if (!kind || !activeSession) return null;
    const grpc = activeCollectionRequest?.grpc ?? activeSession.grpc;
    const currentRequestJson = typeof getRequestJsonDraft === "function" ? getRequestJsonDraft() : requestJson;
    const draftTarget = typeof targetDraft === "string" && targetDraft.trim() ? targetDraft : "";
    const savedBaseUrl = activeTransportMode === "native-grpc" ? activeBaseUrl : draftTarget || activeBaseUrl;
    const savedNativeTarget = activeTransportMode === "native-grpc" ? draftTarget || activeNativeTarget : activeNativeTarget;
    return {
      kind,
      requestJson: currentRequestJson,
      metadata: cloneMetadata(metadata),
      transportMode: kind === "rest" ? "rest" : kind === "websocket" ? "websocket" : activeTransportMode,
      baseUrl: savedBaseUrl,
      nativeTarget: savedNativeTarget,
      environmentKey: activeEnvironmentKey,
      assertionJson,
      grpc,
      grpcMethodKey:
        grpc?.methodFullName ??
        activeCollectionRequest?.grpcMethodKey ??
        (selectedMethod ? `${selectedMethod.serviceName}.${selectedMethod.methodName}` : undefined),
      timeoutMs: activeSession.timeoutMs ?? activeCollectionRequest?.timeoutMs,
      streamIdleTimeoutMs: activeSession.streamIdleTimeoutMs ?? activeCollectionRequest?.streamIdleTimeoutMs,
      httpMethod: activeCollectionRequest?.method ?? activeSession.httpMethod,
      restParams: cloneMetadata(activeCollectionRequest?.restParams),
      restPathParams: cloneMetadata(activeCollectionRequest?.restPathParams),
      restAuth: activeCollectionRequest?.restAuth,
      restBodyType: activeCollectionRequest?.restBodyType,
    };
  }

  function saveCurrentRequestAsSaved(name: string, existingId?: string): SavedRequest | null {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast("Saved request name is required.", "warning");
      return null;
    }
    const snapshot = buildCurrentSavedRequestSnapshot();
    if (!snapshot) {
      showToast("Open a request before saving it.", "warning");
      return null;
    }

    const now = new Date().toISOString();
    const existing = existingId
      ? (savedRequests as SavedRequest[]).find((item) => item.id === existingId)
      : undefined;
    const next: SavedRequest = {
      id: existing?.id ?? createSavedRequestId(),
      name: trimmedName,
      kind: snapshot.kind,
      snapshot,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    setSavedRequests((current: SavedRequest[]) =>
      existing
        ? current.map((item) => (item.id === existing.id ? next : item))
        : [next, ...current],
    );
    updateActiveSession({ savedRequestId: next.id });
    showToast(existing ? `Saved request ${next.name} updated.` : `Request saved as ${next.name}.`, "success");
    return next;
  }

  function loadSavedRequest(savedRequestId: string): boolean {
    const saved = (savedRequests as SavedRequest[]).find((item) => item.id === savedRequestId);
    if (!saved) {
      showToast("Saved request is no longer available.", "warning");
      return false;
    }
    const currentKind = activeRequestKind(scope);
    if (!activeSession || !currentKind) {
      showToast("Open a request before loading a saved request.", "warning");
      return false;
    }
    if (saved.kind !== currentKind) {
      showToast(`Open a ${saved.kind.toUpperCase()} request before loading ${saved.name}.`, "warning");
      return false;
    }

    const snapshot = saved.snapshot;
    const nextMetadata = cloneMetadata(snapshot.metadata);
    const nextTransportMode = saved.kind === "rest" ? "rest" : saved.kind === "websocket" ? "websocket" : snapshot.transportMode;
    setRequestJson(snapshot.requestJson);
    setMetadata(nextMetadata);
    setTransportMode(nextTransportMode);
    if (saved.kind === "grpc") {
      if (nextTransportMode === "native-grpc") setNativeTarget(snapshot.nativeTarget);
      else setBaseUrl(snapshot.baseUrl);
    }
    setEnvironmentKey(snapshot.environmentKey);
    setAssertionJson(snapshot.assertionJson);
    setTargetDraft(nextTransportMode === "native-grpc" ? snapshot.nativeTarget : snapshot.baseUrl);

    const sessionPatch: Partial<RequestSession> = {
      savedRequestId: saved.id,
      requestKind: activeCollectionRequest ? saved.kind : activeSession.requestKind,
      requestJson: snapshot.requestJson,
      metadata: nextMetadata,
      transportMode: nextTransportMode,
      baseUrl: snapshot.baseUrl,
      requestUrl: snapshot.baseUrl,
      nativeTarget: snapshot.nativeTarget,
      environmentKey: snapshot.environmentKey,
      assertionJson: snapshot.assertionJson,
      timeoutMs: snapshot.timeoutMs,
      streamIdleTimeoutMs: snapshot.streamIdleTimeoutMs,
      httpMethod: snapshot.httpMethod,
    };

    if (saved.kind === "grpc" && snapshot.grpc) {
      sessionPatch.grpc = snapshot.grpc;
      const compiled = protoRuntimeRegistry?.resolveVersion(snapshot.grpc.libraryId, snapshot.grpc.versionId);
      const grpcMethodKey = snapshot.grpc.methodFullName ?? snapshot.grpcMethodKey ?? "";
      const method = compiled?.loaded.methods.find((item: any) => item.fullName === grpcMethodKey || `${item.serviceName}.${item.methodName}` === grpcMethodKey);
      if (compiled) {
        setActiveProtoLibraryId(compiled.library.id);
        setActiveProtoVersionId(compiled.version.id);
        setLoaded(compiled.loaded);
      }
      setSelectedMethodKey(grpcMethodKey);
      if (!activeCollectionRequest) {
        sessionPatch.methodKey = grpcMethodKey || activeSession.methodKey;
        sessionPatch.serviceName = method?.serviceName ?? activeSession.serviceName;
      }
    }

    updateActiveSession(sessionPatch);

    if (activeCollectionRequest) {
      patchActiveCollectionRequest({
        body: snapshot.requestJson,
        headers: nextMetadata,
        url: snapshot.baseUrl,
        timeoutMs: snapshot.timeoutMs,
        streamIdleTimeoutMs: snapshot.streamIdleTimeoutMs,
        ...(saved.kind === "grpc"
          ? {
              grpc: snapshot.grpc,
              grpcMethodKey: snapshot.grpc?.methodFullName ?? snapshot.grpcMethodKey,
            }
          : {}),
        ...(saved.kind === "rest"
          ? {
              method: snapshot.httpMethod ?? "GET",
              restParams: cloneMetadata(snapshot.restParams),
              restPathParams: cloneMetadata(snapshot.restPathParams),
              restAuth: snapshot.restAuth,
              restBodyType: snapshot.restBodyType,
            }
          : {}),
      });
    }

    showToast(`Loaded saved request ${saved.name}.`, "success");
    return true;
  }

  function renameSavedRequest(savedRequestId: string, name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast("Saved request name is required.", "warning");
      return false;
    }
    let renamed = false;
    setSavedRequests((current: SavedRequest[]) =>
      current.map((item) => {
        if (item.id !== savedRequestId) return item;
        renamed = true;
        return { ...item, name: trimmed, updatedAt: new Date().toISOString() };
      }),
    );
    if (renamed) showToast(`Saved request renamed to ${trimmed}.`, "success");
    return renamed;
  }

  function deleteSavedRequest(savedRequestId: string): boolean {
    const saved = (savedRequests as SavedRequest[]).find((item) => item.id === savedRequestId);
    if (!saved) return false;
    setSavedRequests((current: SavedRequest[]) => current.filter((item) => item.id !== savedRequestId));
    if (activeSession?.savedRequestId === savedRequestId) updateActiveSession({ savedRequestId: undefined });
    showToast(`Saved request ${saved.name} deleted.`, "success");
    return true;
  }

  return {
    buildCurrentSavedRequestSnapshot,
    saveCurrentRequestAsSaved,
    loadSavedRequest,
    renameSavedRequest,
    deleteSavedRequest,
  };
}
