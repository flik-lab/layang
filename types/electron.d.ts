import type { GrpcEvent, GrpcResult, MetadataPair, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";
import type { WebSocketMockLog } from "@/app/playground/shared/workbench-types";

export type LayangLogLevel = "debug" | "info" | "warn" | "error";
export interface LayangLoggerSettings {
  level: LayangLogLevel;
  mirrorToConsole: boolean;
  maxBytes: number;
  maxTotalBytes: number;
  retentionDays: number;
}
export interface LayangLoggerInfo {
  ok?: boolean;
  initialized: boolean;
  logDir: string;
  logFilePath: string;
  settingsFilePath: string;
  isPackaged: boolean;
  totalBytes: number;
  fileCount: number;
  settings: LayangLoggerSettings;
  error?: string;
}

export interface LayangImportedCertificate {
  id: string;
  name: string;
  fingerprint: string;
  pem: string;
  importedAt: string;
  sourcePath?: string;
}
export interface LayangCertificateSettings {
  version: 1;
  caCertificatePem: string;
  caCertificates: LayangImportedCertificate[];
  bypassTlsErrors: boolean;
  updatedAt: string;
}
export interface LayangCertificateSettingsInfo {
  ok?: boolean;
  initialized: boolean;
  settingsFilePath: string;
  settings: LayangCertificateSettings;
  fingerprint: string;
  fingerprints?: string[];
  filePath?: string;
  filePaths?: string[];
  cancelled?: boolean;
  error?: string;
}

export interface LayangAppZoomSettings {
  version: 1;
  zoomPercent: number;
  updatedAt: string;
}
export interface LayangAppZoomInfo {
  ok?: boolean;
  initialized: boolean;
  settingsFilePath: string;
  settings: LayangAppZoomSettings;
  minZoomPercent: number;
  maxZoomPercent: number;
  zoomStepPercent: number;
  error?: string;
}

declare global {
  interface Window {
    electronGrpc?: {
      isAvailable: boolean;
      invoke: (payload: {
        runId?: string;
        targetUrl: string;
        protoFiles: ProtoSourceFile[];
        method: RpcMethodInfo;
        requestJson: unknown;
        metadata: MetadataPair[];
        deadlineMs?: number;
        maxMessages?: number;
        onEvent?: (event: GrpcEvent) => void;
      }) => Promise<GrpcResult>;
      cancelActive?: (runId?: string) => Promise<{ cancelled: boolean }>;
    };
    electronLogger?: {
      isAvailable: boolean;
      log?: (payload: {
        level?: LayangLogLevel;
        scope?: string;
        message?: string;
        data?: unknown[] | unknown;
      }) => Promise<{ ok: boolean; error?: string }>;
      getInfo?: () => Promise<LayangLoggerInfo>;
      setSettings?: (settings: Partial<LayangLoggerSettings>) => Promise<LayangLoggerInfo>;
      openFolder?: () => Promise<{ ok: boolean; path?: string; error?: string }>;
      clear?: () => Promise<LayangLoggerInfo>;
    };
    electronCertificateSettings?: {
      isAvailable: boolean;
      get?: () => Promise<LayangCertificateSettingsInfo>;
      set?: (settings: Partial<LayangCertificateSettings>) => Promise<LayangCertificateSettingsInfo>;
      clear?: () => Promise<LayangCertificateSettingsInfo>;
      importFile?: () => Promise<LayangCertificateSettingsInfo>;
    };
    electronAppZoom?: {
      isAvailable: boolean;
      get?: () => Promise<LayangAppZoomInfo>;
      set?: (zoomPercent: number) => Promise<LayangAppZoomInfo>;
      zoomIn?: () => Promise<LayangAppZoomInfo>;
      zoomOut?: () => Promise<LayangAppZoomInfo>;
      reset?: () => Promise<LayangAppZoomInfo>;
      onChanged?: (callback: (info: LayangAppZoomInfo) => void) => () => void;
    };
    electronWorkspace?: {
      isAvailable: boolean;
      saveFolder?: (
        bundle: unknown,
        directoryPath?: string,
      ) => Promise<{ ok: boolean; cancelled?: boolean; directoryPath?: string; error?: string }>;
      openFolder?: (
        directoryPath?: string,
      ) => Promise<{ ok: boolean; cancelled?: boolean; directoryPath?: string; bundle?: unknown; error?: string }>;
      readMockServer?: (directoryPath: string) => Promise<{ ok: boolean; mockServer?: unknown; error?: string }>;
      getDefaultFolder?: () => Promise<{ ok: boolean; directoryPath?: string; error?: string }>;
      ensureDefaultFolder?: (
        bundle: unknown,
      ) => Promise<{ ok: boolean; created?: boolean; directoryPath?: string; bundle?: unknown; error?: string }>;
      ensureFolder?: (
        bundle: unknown,
        directoryPath: string,
      ) => Promise<{ ok: boolean; created?: boolean; directoryPath?: string; bundle?: unknown; error?: string }>;
      getPreference?: () => Promise<{
        ok: boolean;
        directoryPath?: string;
        defaultDirectoryPath?: string;
        hasCustomPreference?: boolean;
        error?: string;
      }>;
      setPreference?: (
        directoryPath?: string,
      ) => Promise<{ ok: boolean; directoryPath?: string; hasCustomPreference?: boolean; error?: string }>;
      chooseFolder?: (
        title?: string,
      ) => Promise<{ ok: boolean; cancelled?: boolean; directoryPath?: string; error?: string }>;
      openPath?: (
        directoryPath: string,
        relativePath?: string,
        options?: { ensureDirectory?: boolean; reveal?: boolean },
      ) => Promise<{ ok: boolean; path?: string; error?: string }>;
    };
    electronMock?: {
      isAvailable: boolean;
      start?: (payload: {
        port: number;
        bindHost?: string;
        protoFiles: ProtoSourceFile[];
        methods: RpcMethodInfo[];
        scenarios: unknown[];
        streamDefaults?: { intervalMs?: number; loop?: boolean; maxLoops?: number };
        activeScenarioIds?: Record<string, string>;
        enabledMethods?: Record<string, boolean>;
        workspaceDirectory?: string;
        uiRuntimeRevision?: number;
        mockServerUpdatedAt?: string;
      }) => Promise<{
        ok: boolean;
        port?: number;
        url?: string;
        bindHost?: string;
        bindAddress?: string;
        localTarget?: string;
        apisixTarget?: string;
        reachableTargets?: Array<{ label: string; host: string; target: string }>;
        scenarioCount?: number;
        methodCount?: number;
        activeScenarioIds?: Record<string, string>;
        enabledMethods?: Record<string, boolean>;
        configVersion?: number;
        error?: string;
      }>;
      update?: (payload: {
        port?: number;
        bindHost?: string;
        protoFiles?: ProtoSourceFile[];
        methods?: RpcMethodInfo[];
        scenarios: unknown[];
        streamDefaults?: { intervalMs?: number; loop?: boolean; maxLoops?: number };
        activeScenarioIds?: Record<string, string>;
        enabledMethods?: Record<string, boolean>;
        workspaceDirectory?: string;
        uiRuntimeRevision?: number;
        mockServerUpdatedAt?: string;
      }) => Promise<{
        ok: boolean;
        running?: boolean;
        restarted?: boolean;
        port?: number;
        url?: string;
        bindHost?: string;
        bindAddress?: string;
        localTarget?: string;
        apisixTarget?: string;
        reachableTargets?: Array<{ label: string; host: string; target: string }>;
        scenarioCount?: number;
        methodCount?: number;
        activeScenarioIds?: Record<string, string>;
        enabledMethods?: Record<string, boolean>;
        configVersion?: number;
        updatedAt?: string;
        message?: string;
        error?: string;
      }>;
      stop?: () => Promise<{ ok: boolean; message?: string }>;
      status?: () => Promise<{
        running: boolean;
        port?: number;
        url?: string;
        bindHost?: string;
        bindAddress?: string;
        localTarget?: string;
        apisixTarget?: string;
        reachableTargets?: Array<{ label: string; host: string; target: string }>;
        scenarioCount?: number;
        methodCount?: number;
        activeScenarioIds?: Record<string, string>;
        enabledMethods?: Record<string, boolean>;
        configVersion?: number;
        updatedAt?: string;
      }>;
    };

    electronWsMock?: {
      isAvailable: boolean;
      start?: (payload: {
        port: number;
        path?: string;
        responseText?: string;
        intervalMs?: number;
        loop?: boolean;
        maxLoops?: number;
        streamOnConnect?: boolean;
        sendOnMessage?: boolean;
        scenarios?: Array<{
          id: string;
          requestId?: string;
          name?: string;
          enabled?: boolean;
          path: string;
          responseText: string;
          intervalMs?: number;
          loop?: boolean;
          maxLoops?: number;
          streamOnConnect?: boolean;
          sendOnMessage?: boolean;
          matchMode?: "always" | "contains" | "regex" | "jsonPath";
          matchValue?: string;
          matchJsonPath?: string;
        }>;
      }) => Promise<{
        ok: boolean;
        running?: boolean;
        port?: number;
        path?: string;
        url?: string;
        clientCount?: number;
        messageCount?: number;
        intervalMs?: number;
        loop?: boolean;
        maxLoops?: number;
        streamOnConnect?: boolean;
        sendOnMessage?: boolean;
        scenarioCount?: number;
        requestPaths?: Array<{
          id: string;
          requestId?: string;
          name: string;
          path: string;
          enabled: boolean;
          url: string;
        }>;
        logs?: WebSocketMockLog[];
        startedAt?: string;
        updatedAt?: string;
        error?: string;
      }>;
      update?: (payload: {
        port?: number;
        path?: string;
        responseText?: string;
        intervalMs?: number;
        loop?: boolean;
        maxLoops?: number;
        streamOnConnect?: boolean;
        sendOnMessage?: boolean;
        scenarios?: Array<{
          id: string;
          requestId?: string;
          name?: string;
          enabled?: boolean;
          path: string;
          responseText: string;
          intervalMs?: number;
          loop?: boolean;
          maxLoops?: number;
          streamOnConnect?: boolean;
          sendOnMessage?: boolean;
          matchMode?: "always" | "contains" | "regex" | "jsonPath";
          matchValue?: string;
          matchJsonPath?: string;
        }>;
      }) => Promise<{
        ok: boolean;
        running?: boolean;
        url?: string;
        clientCount?: number;
        messageCount?: number;
        error?: string;
      }>;
      send?: (payload?: {
        responseText?: string;
        scenarioId?: string;
        path?: string;
        scenarios?: Array<{
          id: string;
          requestId?: string;
          name?: string;
          enabled?: boolean;
          path: string;
          responseText: string;
          intervalMs?: number;
          loop?: boolean;
          maxLoops?: number;
          streamOnConnect?: boolean;
          sendOnMessage?: boolean;
          matchMode?: "always" | "contains" | "regex" | "jsonPath";
          matchValue?: string;
          matchJsonPath?: string;
        }>;
      }) => Promise<{
        ok: boolean;
        sent?: number;
        running?: boolean;
        clientCount?: number;
        messageCount?: number;
        error?: string;
      }>;
      stop?: () => Promise<{ ok: boolean; running?: boolean; message?: string; error?: string }>;
      status?: () => Promise<{
        running: boolean;
        port?: number;
        path?: string;
        url?: string;
        clientCount?: number;
        messageCount?: number;
        intervalMs?: number;
        loop?: boolean;
        maxLoops?: number;
        streamOnConnect?: boolean;
        sendOnMessage?: boolean;
        scenarioCount?: number;
        requestPaths?: Array<{
          id: string;
          requestId?: string;
          name: string;
          path: string;
          enabled: boolean;
          url: string;
        }>;
        logs?: WebSocketMockLog[];
        startedAt?: string;
        updatedAt?: string;
      }>;
    };

    electronRestMock?: {
      isAvailable: boolean;
      start?: (payload: {
        port: number;
        bindHost?: string;
        scenarios?: Array<{
          id: string;
          requestId?: string;
          name: string;
          enabled: boolean;
          method: string;
          path: string;
          priority?: number;
          status: number;
          headers?: MetadataPair[];
          body?: string;
          delayMs?: number;
          matchQuery?: MetadataPair[];
          matchHeaders?: MetadataPair[];
          matchBodyContains?: string;
          matchJsonPath?: string;
          matchJsonEquals?: string;
        }>;
      }) => Promise<{
        ok: boolean;
        running?: boolean;
        port?: number;
        bindHost?: string;
        url?: string;
        scenarioCount?: number;
        requestCount?: number;
        requestLog?: Array<{
          id: string;
          method: string;
          path: string;
          status: number;
          scenarioId?: string;
          matched: boolean;
          durationMs: number;
          timestamp: string;
        }>;
        message?: string;
        error?: string;
      }>;
      update?: (payload: { port?: number; bindHost?: string; scenarios?: unknown[] }) => Promise<{
        ok: boolean;
        running?: boolean;
        port?: number;
        bindHost?: string;
        url?: string;
        scenarioCount?: number;
        requestCount?: number;
        requestLog?: Array<{
          id: string;
          method: string;
          path: string;
          status: number;
          scenarioId?: string;
          matched: boolean;
          durationMs: number;
          timestamp: string;
        }>;
        message?: string;
        error?: string;
      }>;
      stop?: () => Promise<{ ok: boolean; running?: boolean; message?: string; error?: string }>;
      status?: () => Promise<{
        ok?: boolean;
        running: boolean;
        port?: number;
        bindHost?: string;
        url?: string;
        scenarioCount?: number;
        requestCount?: number;
        requestLog?: Array<{
          id: string;
          method: string;
          path: string;
          status: number;
          scenarioId?: string;
          matched: boolean;
          durationMs: number;
          timestamp: string;
        }>;
        message?: string;
        updatedAt?: string;
      }>;
    };

    electronWindow?: {
      isAvailable: boolean;
      minimize?: () => Promise<{ ok: boolean }>;
      maximizeToggle?: () => Promise<{ maximized: boolean }>;
      close?: () => Promise<{ ok: boolean }>;
      toggleAlwaysOnTop?: () => Promise<{ alwaysOnTop: boolean }>;
    };
  }
}
