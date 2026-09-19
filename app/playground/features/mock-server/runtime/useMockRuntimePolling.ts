"use client";

import { useEffect, useRef } from "react";
import type { MockServerProject } from "../../../shared/workbench-types";
import { mockRuntimeStore } from "./mockRuntime.store";

export type UseMockRuntimePollingOptions = {
  mockServer: MockServerProject;
};

type RuntimeTimer = number | null;

function getInitialRuntimeMode(): "main" | "utility" {
  if (typeof window === "undefined") return "main";
  return window.electronRuntime?.mode === "utility" ? "utility" : "main";
}

export function useMockRuntimePolling({ mockServer }: UseMockRuntimePollingOptions): void {
  const profileIdRef = useRef(mockServer.activeGatewayProfileId);
  const runtimeModeRef = useRef<"main" | "utility">(getInitialRuntimeMode());
  profileIdRef.current = mockServer.activeGatewayProfileId;

  useEffect(() => {
    let cancelled = false;
    let grpcTimer: RuntimeTimer = null;
    let restTimer: RuntimeTimer = null;
    let webSocketTimer: RuntimeTimer = null;
    let webAccessTimer: RuntimeTimer = null;

    const refreshGrpc = async (): Promise<void> => {
      if (cancelled || !mockRuntimeStore.getGrpc().running || !window.electronMock?.status) return;
      mockRuntimeStore.recordPoll();
      mockRuntimeStore.recordRuntimeStatusPoll();
      const result = await window.electronMock.status();
      if (cancelled || !result) return;
      mockRuntimeStore.patchGrpc((current) =>
        current.running || result.running ? { ...current, ...result, running: result.running ?? current.running } : current,
      );
    };

    const refreshRest = async (): Promise<void> => {
      if (cancelled || !mockRuntimeStore.getRest().running || !window.electronRestMock?.status) return;
      mockRuntimeStore.recordPoll();
      mockRuntimeStore.recordRuntimeStatusPoll();
      const result = await window.electronRestMock.status();
      if (cancelled || !result) return;
      mockRuntimeStore.patchRest((current) =>
        current.running || result.running ? { ...current, ...result, running: result.running ?? current.running } : current,
      );
    };

    const refreshWebSocket = async (): Promise<void> => {
      if (cancelled || !mockRuntimeStore.getWebSocket().running || !window.electronWsMock?.status) return;
      mockRuntimeStore.recordPoll();
      mockRuntimeStore.recordRuntimeStatusPoll();
      const result = await window.electronWsMock.status();
      if (cancelled || !result) return;
      mockRuntimeStore.patchWebSocket((current) =>
        current.running || result.running ? { ...current, ...result, running: result.running ?? current.running } : current,
      );
    };

    const refreshWebAccess = async (): Promise<void> => {
      if (cancelled || !mockRuntimeStore.getWebAccess().running || !window.electronGateway?.status) return;
      mockRuntimeStore.recordPoll();
      const result = await window.electronGateway.status({ profileId: profileIdRef.current });
      if (cancelled || !result?.ok) return;
      mockRuntimeStore.patchWebAccess((current) =>
        current.running
          ? {
              ...current,
              gateway: result,
              port: result.webPort ?? current.port,
              bindHost: result.webHost ?? current.bindHost,
              bindAddress: result.webUrl ?? current.bindAddress,
              url: result.webUrl ?? current.url,
              methodCount: result.methodCount ?? current.methodCount,
              activeCallCount: result.activeCallCount,
            }
          : current,
      );
    };

    const reconcileOne = (
      running: boolean,
      available: boolean,
      current: RuntimeTimer,
      refresh: () => Promise<void>,
      intervalMs: number,
    ): RuntimeTimer => {
      if (running && available && current === null) {
        void refresh();
        return window.setInterval(() => void refresh(), intervalMs);
      }
      if ((!running || !available) && current !== null) {
        window.clearInterval(current);
        return null;
      }
      return current;
    };

    const reconcileTimers = (): void => {
      if (runtimeModeRef.current === "utility") {
        if (grpcTimer !== null) window.clearInterval(grpcTimer);
        if (restTimer !== null) window.clearInterval(restTimer);
        if (webSocketTimer !== null) window.clearInterval(webSocketTimer);
        grpcTimer = null;
        restTimer = null;
        webSocketTimer = null;
      } else {
        grpcTimer = reconcileOne(mockRuntimeStore.getGrpc().running, Boolean(window.electronMock?.status), grpcTimer, refreshGrpc, 1500);
        restTimer = reconcileOne(mockRuntimeStore.getRest().running, Boolean(window.electronRestMock?.status), restTimer, refreshRest, 1500);
        webSocketTimer = reconcileOne(
          mockRuntimeStore.getWebSocket().running,
          Boolean(window.electronWsMock?.status),
          webSocketTimer,
          refreshWebSocket,
          1500,
        );
      }
      webAccessTimer = reconcileOne(
        mockRuntimeStore.getWebAccess().running,
        Boolean(window.electronGateway?.status),
        webAccessTimer,
        refreshWebAccess,
        1000,
      );
    };

    reconcileTimers();
    const unsubscribe = mockRuntimeStore.subscribe(reconcileTimers);
    return () => {
      cancelled = true;
      unsubscribe();
      if (grpcTimer !== null) window.clearInterval(grpcTimer);
      if (restTimer !== null) window.clearInterval(restTimer);
      if (webSocketTimer !== null) window.clearInterval(webSocketTimer);
      if (webAccessTimer !== null) window.clearInterval(webAccessTimer);
    };
  }, []);
}
