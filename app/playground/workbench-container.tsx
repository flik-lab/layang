"use client";

import { Profiler, useEffect, useState } from "react";
import { WorkbenchShell } from "./features/shell/workbench-shell";
import { WorkbenchAppBar } from "./features/shell/workbench-app-bar";
import { WorkbenchSidebar } from "./features/shell/workbench-sidebar";
import { WorkbenchMainPanel } from "./features/shell/workbench-main-panel";
import { WorkbenchDialogs } from "./features/shell/workbench-dialogs";
import { WorkbenchStatusBar } from "./features/shell/workbench-status-bar";
import { CliTerminalPanel } from "./features/cli/cli-terminal-panel";
import { useWorkbenchContainerModel } from "./features/shell/use-workbench-container-model";
import { SidebarProvider } from "@/components/ui/sidebar";
import { railWidth } from "./shared/workbench-constants";
import { useWorkbenchSideSection } from "./features/shell/workbench-navigation-store";
import { performanceStats } from "./shared/performance/performance-stats.store";
import { PerformanceStatsHost } from "./shared/performance/PerformanceStatsHost";
import {
  DetachedMockingWindow,
  DetachedPerformanceWindow,
  DetachedRequestWindow,
  DetachedResponseWindow,
} from "./features/windows/detached-window-surfaces";
import { useResponseWindowSync } from "./features/windows/use-response-window-sync";

type NavigationAwareCliTerminalPanelProps = {
  height: number;
  onClose: () => void;
  onHeightChange: (height: number) => void;
  open: boolean;
  shellLeft: number;
  statusbarHeight: number;
  workspacePath: string;
};

function NavigationAwareCliTerminalPanel({
  height,
  onClose,
  onHeightChange,
  open,
  shellLeft,
  statusbarHeight,
  workspacePath,
}: NavigationAwareCliTerminalPanelProps) {
  const sideSection = useWorkbenchSideSection();
  return (
    <CliTerminalPanel
      open={open}
      height={height}
      shellLeft={sideSection === "source-control" ? railWidth : shellLeft}
      statusbarHeight={statusbarHeight}
      workspacePath={workspacePath}
      onClose={onClose}
      onHeightChange={onHeightChange}
    />
  );
}

export default function WorkbenchContainer() {
  performanceStats.recordRenderInvocation("container");
  const { theme, viewContext } = useWorkbenchContainerModel();
  const [cliPanelOpen, setCliPanelOpen] = useState(false);
  const [cliPanelHeight, setCliPanelHeight] = useState(260);

  const detachedWindowContext = viewContext.managedWindow.context;
  const windowKind = detachedWindowContext.kind;
  const normalizedDetachedTitle = (detachedWindowContext.title ?? "").trim().toLowerCase();
  const performanceLikeWindow =
    windowKind === "performance" ||
    (!detachedWindowContext.resourceId && !detachedWindowContext.responseSessionId && normalizedDetachedTitle === "performance");
  const performanceWindowOpen = viewContext.managedWindow.windows.some((item) => item.kind === "performance");
  useResponseWindowSync(viewContext);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "`") return;
      event.preventDefault();
      setCliPanelOpen((current) => !current);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  if (performanceLikeWindow) {
    return (
      <WorkbenchShell theme={theme} density={viewContext.densityMode}>
        <DetachedPerformanceWindow ctx={viewContext} />
      </WorkbenchShell>
    );
  }

  if (windowKind !== "main") {
    return (
      <WorkbenchShell theme={theme} density={viewContext.densityMode}>
        {windowKind === "mocking" ? (
          <DetachedMockingWindow ctx={viewContext} />
        ) : windowKind === "response" ? (
          <DetachedResponseWindow ctx={viewContext} />
        ) : (
          <DetachedRequestWindow ctx={viewContext} />
        )}
        <WorkbenchDialogs ctx={viewContext} />
      </WorkbenchShell>
    );
  }

  return (
    <WorkbenchShell theme={theme} density={viewContext.densityMode}>
      <SidebarProvider open={viewContext.sidebarOpen} onOpenChange={viewContext.setSidebarOpen}>
        <Profiler id="Workbench" onRender={(_id: string, _phase: string, actualDuration: number) => performanceStats.recordReactCommit("Workbench", actualDuration)}>
          <WorkbenchAppBar ctx={viewContext} />
          <WorkbenchSidebar ctx={viewContext} />
          <WorkbenchMainPanel ctx={viewContext} cliPanelOpen={cliPanelOpen} cliPanelHeight={cliPanelHeight} />
          <WorkbenchDialogs ctx={viewContext} />
        </Profiler>
        <NavigationAwareCliTerminalPanel
          open={cliPanelOpen}
          height={cliPanelHeight}
          shellLeft={viewContext.shellLeft}
          statusbarHeight={viewContext.designSystem.size.statusbarHeight}
          workspacePath={viewContext.workspaceFolderPath || ""}
          onClose={() => setCliPanelOpen(false)}
          onHeightChange={setCliPanelHeight}
        />
        <WorkbenchStatusBar ctx={viewContext} cliPanelOpen={cliPanelOpen} setCliPanelOpen={setCliPanelOpen} />
        <PerformanceStatsHost
          activeRunning={Boolean(viewContext.activeRunning)}
          enabled={performanceWindowOpen}
        />
      </SidebarProvider>
    </WorkbenchShell>
  );
}
