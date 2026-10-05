"use client";

import { useEffect } from "react";
import {
  useGrpcMockRuntimeStatus,
  useRestMockRuntimeStatus,
  useWebAccessRuntimeStatus,
  useWebSocketMockRuntimeStatus,
} from "../../features/mock-server/runtime/useMockRuntimeSelector";
import { useWorkbenchSideSection } from "../../features/shell/workbench-navigation-store";
import { performanceStats } from "./performance-stats.store";
import { syncRuntimeDiagnostics } from "./PerformanceStatsPanel";

/**
 * Samples the primary renderer and mirrors snapshots to the dedicated
 * Performance BrowserWindow. Keeping sampling here means the performance
 * window measures the actual workbench instead of measuring itself.
 */
export function PerformanceStatsHost({
  activeRunning,
  enabled,
}: {
  activeRunning: boolean;
  enabled: boolean;
}) {
  const sideSection = useWorkbenchSideSection();
  const grpc = useGrpcMockRuntimeStatus();
  const webAccess = useWebAccessRuntimeStatus();
  const rest = useRestMockRuntimeStatus();
  const websocket = useWebSocketMockRuntimeStatus();

  useEffect(() => {
    if (!enabled) {
      performanceStats.setEnabled(false);
      return;
    }

    let disposed = false;
    performanceStats.setEnabled(true);

    const publish = async () => {
      await syncRuntimeDiagnostics();
      if (disposed) return;
      performanceStats.setRuntime({
        section: sideSection,
        streamActive: activeRunning,
        mockActive: Boolean(grpc?.running || webAccess?.running || rest?.running || websocket?.running),
      });
      const snapshot = performanceStats.sample();
      await window.electronWindow?.broadcast?.("performance:snapshot", { snapshot });
    };

    void publish();
    const timer = window.setInterval(() => void publish(), 500);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      performanceStats.setEnabled(false);
    };
  }, [
    activeRunning,
    enabled,
    grpc?.running,
    rest?.running,
    sideSection,
    webAccess?.running,
    websocket?.running,
  ]);

  return null;
}
