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
    envDraftUrl,
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
    setEnvironmentKey(value);
    updateActiveSession({ environmentKey: value });
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

  function saveCurrentEnvironment() {
    setEnvMenuAnchor(null);
    const currentUrl = activeTransportMode === "native-grpc" ? draftEffectiveNativeTarget : draftEffectiveBaseUrl;
    setEnvDialogMode("create");
    setEnvEditingKey("");
    setEnvDraftName(
      selectedMethod
        ? `${selectedMethod.methodName} Env`
        : activeCollectionRequest
          ? `${activeCollectionRequest.name} Env`
          : "New Environment",
    );
    setEnvDraftUrl(currentUrl);
    setEnvDialogOpen(true);
  }

  function confirmSaveCurrentEnvironment() {
    const name = envDraftName.trim();
    const url = envDraftUrl.trim();
    if (!name) {
      showToast("Environment name is required.", "warning");
      return;
    }
    if (!url) {
      showToast(
        activeTransportMode === "native-grpc" ? "Native gRPC target is required." : "Request URL is required.",
        "warning",
      );
      return;
    }

    if (envDialogMode === "edit" && envEditingKey) {
      setEnvironments((current) =>
        current.map((env) =>
          env.key === envEditingKey
            ? featureSetEnvironmentTransportTarget({ ...env, label: name }, activeTransportMode, url)
            : env,
        ),
      );
      setEnvDialogOpen(false);
      showToast(`Environment updated: ${name}`, "success");
      return;
    }

    const key = `custom-${slugify(name)}-${Date.now().toString(36)}`;
    const defaultEnv = defaultEnvironments[0];
    const baseEnv: EnvironmentConfig = {
      key,
      label: name,
      grpcWebBaseUrl: activeTransportMode === "grpc-web" ? url : defaultEnv.grpcWebBaseUrl,
      nativeTarget: activeTransportMode === "native-grpc" ? url : defaultEnv.nativeTarget,
      websocketUrl: activeTransportMode === "websocket" ? url : defaultEnv.websocketUrl,
      restBaseUrl: activeTransportMode === "rest" ? url : defaultEnv.restBaseUrl,
    };
    const env = featureSetEnvironmentTransportTarget(baseEnv, activeTransportMode, url);
    setEnvironments((current) => featureMergeEnvironments([...current, env]));
    handleEnvironmentKeyChange(key);
    setEnvDialogOpen(false);
    showToast(`Environment saved: ${env.label}`, "success");
  }

  function chooseEnvironment(key: EnvironmentKey) {
    handleEnvironmentKeyChange(key);
    setEnvMenuAnchor(null);
  }

  function openEnvironmentManager(env: EnvironmentConfig) {
    setEnvMenuAnchor(null);
    setEnvDialogMode("edit");
    setEnvEditingKey(env.key);
    setEnvDraftName(env.label);
    setEnvDraftUrl(featureGetEnvironmentTransportTarget(env, activeTransportMode));
    setEnvDialogOpen(true);
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
    removeEditingEnvironment,
  };
}
