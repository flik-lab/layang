"use client";

import type {
  ApiCollectionRequest,
  EnvironmentConfig,
  EnvironmentKey,
  TransportMode,
} from "../../shared/workbench-types";
import type { RpcMethodInfo } from "@/lib/types";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type ActionContext = Record<string, any> & {
  environments: EnvironmentConfig[];
  setEnvironments: StateSetter<EnvironmentConfig[]>;
  defaultEnvironments: EnvironmentConfig[];
  activeCollectionRequest?: ApiCollectionRequest | null;
  selectedMethod?: RpcMethodInfo | null;
  activeTransportMode: TransportMode;
  environmentKey: EnvironmentKey;
};

export function useEnvironmentActions(ctx: ActionContext) {
  const {
    activeCollectionRequest,
    activeEnvironmentKey,
    activeIsRest,
    activeIsWebSocket,
    activeTransportMode,
    defaultEnvironments,
    draftEffectiveBaseUrl,
    draftEffectiveNativeTarget,
    envDialogMode,
    envDraftName,
    envDraftRestUrl,
    envDraftNativeTarget,
    envDraftGrpcWebUrl,
    envDraftWebSocketUrl,
    envEditingKey,
    featureGetEnvironmentTransportTarget,
    featureMergeEnvironments,
    featureSetEnvironmentTransportTarget,
    patchActiveCollectionRequest,
    selectedMethod,
    setBaseUrl,
    setEnvDialogMode,
    setEnvDialogOpen,
    setEnvDraftName,
    setEnvDraftUrl,
    setEnvDraftRestUrl,
    setEnvDraftNativeTarget,
    setEnvDraftGrpcWebUrl,
    setEnvDraftWebSocketUrl,
    setEnvEditingKey,
    setEnvMenuAnchor,
    setEnvironmentKey,
    setEnvironments,
    setNativeTarget,
    setTargetDraft,
    setTransportMode,
    showToast,
    slugify,
    targetDraft,
    updateActiveSession,
  } = ctx;

  function handleTransportModeChange(value: TransportMode) {
    if (activeIsWebSocket && value !== "websocket") return;
    if (activeIsRest && value !== "rest") return;
    if (!activeIsWebSocket && value === "websocket") return;
    if (!activeIsRest && value === "rest") return;
    setTransportMode(value);
    updateActiveSession({ transportMode: value });
  }

  function handleEnvironmentKeyChange(value: EnvironmentKey) {
    // Keep the workspace-level value only as the fallback for new requests.
    // The active request/session owns its selected environment.
    setEnvironmentKey(value);
    updateActiveSession({ environmentKey: value });
    patchActiveCollectionRequest({ environmentKey: value });
  }

  function handleTargetChange(value: string) {
    if (activeEnvironmentKey !== "default" && activeEnvironmentKey !== "manual") {
      setEnvironments((current) =>
        current.map((env) =>
          env.key === activeEnvironmentKey
            ? featureSetEnvironmentTransportTarget(env, activeTransportMode, value)
            : env,
        ),
      );
      return;
    }

    if (activeIsWebSocket || activeIsRest) {
      updateActiveSession({ baseUrl: value, requestUrl: value });
      patchActiveCollectionRequest({ url: value });
      return;
    }

    if (activeTransportMode === "native-grpc") {
      setNativeTarget(value);
      updateActiveSession({ nativeTarget: value });
    } else {
      setBaseUrl(value);
      updateActiveSession({ baseUrl: value, requestUrl: value });
      patchActiveCollectionRequest({ url: value });
    }
  }

  function handleTargetDraftChange(value: string) {
    setTargetDraft(value);
  }

  function commitTargetDraft(value = targetDraft) {
    handleTargetChange(value);
  }

  function setEnvironmentDraftTargets(env: EnvironmentConfig) {
    setEnvDraftRestUrl(env.restBaseUrl ?? "");
    setEnvDraftNativeTarget(env.nativeTarget ?? "");
    setEnvDraftGrpcWebUrl(env.grpcWebBaseUrl ?? "");
    setEnvDraftWebSocketUrl(env.websocketUrl ?? "");
    setEnvDraftUrl(featureGetEnvironmentTransportTarget(env, activeTransportMode));
  }

  function saveCurrentEnvironment() {
    setEnvMenuAnchor(null);
    const defaultEnv = defaultEnvironments[0];
    const draftEnv: EnvironmentConfig = {
      ...defaultEnv,
      key: "",
      label: selectedMethod
        ? `${selectedMethod.methodName} Env`
        : activeCollectionRequest
          ? `${activeCollectionRequest.name} Env`
          : "New Environment",
      restBaseUrl: activeIsRest ? draftEffectiveBaseUrl : defaultEnv.restBaseUrl,
      nativeTarget: activeTransportMode === "native-grpc" ? draftEffectiveNativeTarget : defaultEnv.nativeTarget,
      grpcWebBaseUrl: activeTransportMode === "grpc-web" ? draftEffectiveBaseUrl : defaultEnv.grpcWebBaseUrl,
      websocketUrl: activeIsWebSocket ? draftEffectiveBaseUrl : defaultEnv.websocketUrl,
    };
    setEnvDialogMode("create");
    setEnvEditingKey("");
    setEnvDraftName(draftEnv.label);
    setEnvironmentDraftTargets(draftEnv);
    setEnvDialogOpen(true);
  }

  function confirmSaveCurrentEnvironment() {
    const name = envDraftName.trim();
    if (!name) {
      showToast("Environment name is required.", "warning");
      return;
    }

    const nextTargets = {
      restBaseUrl: envDraftRestUrl.trim(),
      nativeTarget: envDraftNativeTarget.trim(),
      grpcWebBaseUrl: envDraftGrpcWebUrl.trim(),
      websocketUrl: envDraftWebSocketUrl.trim(),
    };
    if (!Object.values(nextTargets).some(Boolean)) {
      showToast("Add at least one environment target.", "warning");
      return;
    }

    if (envDialogMode === "edit" && envEditingKey) {
      setEnvironments((current) =>
        current.map((env) => (env.key === envEditingKey ? { ...env, label: name, ...nextTargets } : env)),
      );
      setEnvDialogOpen(false);
      showToast(`Environment updated: ${name}`, "success");
      return;
    }

    const key = `custom-${slugify(name)}-${Date.now().toString(36)}`;
    const env: EnvironmentConfig = { key, label: name, ...nextTargets };
    setEnvironments((current) => featureMergeEnvironments([...current, env]));
    handleEnvironmentKeyChange(key);
    setEnvDialogOpen(false);
    showToast(`Environment saved: ${env.label}`, "success");
  }

  function chooseEnvironment(key: EnvironmentKey) {
    handleEnvironmentKeyChange(key);
    setEnvMenuAnchor(null);
  }

  function openEnvironmentManager(env?: EnvironmentConfig) {
    setEnvMenuAnchor(null);
    if (!env) {
      const defaultEnv = defaultEnvironments[0];
      setEnvDialogMode("create");
      setEnvEditingKey("");
      setEnvDraftName("New Environment");
      setEnvironmentDraftTargets({ ...defaultEnv, key: "", label: "New Environment" });
      setEnvDialogOpen(true);
      return;
    }
    setEnvDialogMode("edit");
    setEnvEditingKey(env.key);
    setEnvDraftName(env.label);
    setEnvironmentDraftTargets(env);
    setEnvDialogOpen(true);
  }

  function bulkAddEnvironments(source: string) {
    const text = source.trim();
    if (!text) {
      showToast("Paste one or more environments first.", "warning");
      return 0;
    }

    const defaultEnv = defaultEnvironments[0];
    const now = Date.now();
    const parsed: EnvironmentConfig[] = [];

    const addEnvironment = (value: Partial<EnvironmentConfig> & { label?: string; name?: string }, index: number) => {
      const label = String(value.label ?? value.name ?? `Environment ${index + 1}`).trim();
      if (!label) return;
      parsed.push({
        key: String(value.key ?? `custom-${slugify(label)}-${(now + index).toString(36)}`),
        label,
        grpcWebBaseUrl: String(value.grpcWebBaseUrl ?? defaultEnv.grpcWebBaseUrl ?? ""),
        nativeTarget: String(value.nativeTarget ?? defaultEnv.nativeTarget ?? ""),
        websocketUrl: String(value.websocketUrl ?? defaultEnv.websocketUrl ?? ""),
        restBaseUrl: String(value.restBaseUrl ?? defaultEnv.restBaseUrl ?? ""),
      });
    };

    try {
      const json = JSON.parse(text) as unknown;
      const values = Array.isArray(json) ? json : [json];
      values.forEach((value, index) => {
        if (value && typeof value === "object") addEnvironment(value as Partial<EnvironmentConfig>, index);
      });
    } catch {
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      lines.forEach((line, index) => {
        const parts = line
          .split("|")
          .map((part) => part.trim())
          .filter(Boolean);
        const label = parts.shift() ?? `Environment ${index + 1}`;
        const value: Partial<EnvironmentConfig> & { label: string } = { label };
        for (const part of parts) {
          const separator = part.indexOf("=");
          if (separator < 0) {
            const target = part.trim();
            if (activeTransportMode === "native-grpc") value.nativeTarget = target;
            else if (activeTransportMode === "grpc-web") value.grpcWebBaseUrl = target;
            else if (activeTransportMode === "websocket") value.websocketUrl = target;
            else value.restBaseUrl = target;
            continue;
          }
          const key = part.slice(0, separator).trim().toLowerCase();
          const target = part.slice(separator + 1).trim();
          if (["rest", "http", "restbaseurl"].includes(key)) value.restBaseUrl = target;
          else if (["grpc", "native", "nativetarget"].includes(key)) value.nativeTarget = target;
          else if (["web", "grpcweb", "grpc-web", "grpcwebbaseurl"].includes(key)) value.grpcWebBaseUrl = target;
          else if (["ws", "websocket", "websocketurl"].includes(key)) value.websocketUrl = target;
        }
        addEnvironment(value, index);
      });
    }

    if (parsed.length === 0) {
      showToast("No valid environments were found.", "warning");
      return 0;
    }
    setEnvironments((current) => featureMergeEnvironments([...current, ...parsed]));
    showToast(`${parsed.length} environment${parsed.length === 1 ? "" : "s"} added.`, "success");
    return parsed.length;
  }

  function removeEditingEnvironment() {
    if (!envEditingKey || defaultEnvironments.some((env) => env.key === envEditingKey)) {
      showToast("Default environments can be updated, but not removed.", "warning");
      return;
    }
    setEnvironments((current) => current.filter((env) => env.key !== envEditingKey));
    if (activeEnvironmentKey === envEditingKey) handleEnvironmentKeyChange("manual");
    setEnvDialogOpen(false);
    showToast("Environment removed.", "success");
  }

  return {
    handleTransportModeChange,
    handleEnvironmentKeyChange,
    handleTargetChange,
    handleTargetDraftChange,
    commitTargetDraft,
    saveCurrentEnvironment,
    confirmSaveCurrentEnvironment,
    chooseEnvironment,
    openEnvironmentManager,
    bulkAddEnvironments,
    removeEditingEnvironment,
  };
}
