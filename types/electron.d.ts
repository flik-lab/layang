import type { GrpcEvent, GrpcResult, MetadataPair, ProtoSourceFile, RpcMethodInfo } from "@/lib/types";

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
    electronWorkspace?: {
      isAvailable: boolean;
      saveFolder?: (
        bundle: unknown,
        directoryPath?: string,
      ) => Promise<{ ok: boolean; cancelled?: boolean; directoryPath?: string; error?: string }>;
      openFolder?: (
        directoryPath?: string,
      ) => Promise<{ ok: boolean; cancelled?: boolean; directoryPath?: string; bundle?: unknown; error?: string }>;
      getDefaultFolder?: () => Promise<{ ok: boolean; directoryPath?: string; error?: string }>;
      ensureDefaultFolder?: (
        bundle: unknown,
      ) => Promise<{ ok: boolean; created?: boolean; directoryPath?: string; bundle?: unknown; error?: string }>;
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
        responseText: string;
        intervalMs?: number;
        loop?: boolean;
        maxLoops?: number;
        streamOnConnect?: boolean;
        sendOnMessage?: boolean;
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
      }) => Promise<{
        ok: boolean;
        running?: boolean;
        url?: string;
        clientCount?: number;
        messageCount?: number;
        error?: string;
      }>;
      send?: (payload?: { responseText?: string }) => Promise<{
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
        startedAt?: string;
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
