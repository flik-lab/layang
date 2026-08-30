"use client";

import { useEffect, useState } from "react";
import { WorkbenchShell } from "./features/shell/workbench-shell";
import { WorkbenchAppBar } from "./features/shell/workbench-app-bar";
import { WorkbenchSidebar } from "./features/shell/workbench-sidebar";
import { WorkbenchMainPanel } from "./features/shell/workbench-main-panel";
import { WorkbenchDialogs } from "./features/shell/workbench-dialogs";
import { WorkbenchStatusBar } from "./features/shell/workbench-status-bar";
import { CliTerminalPanel } from "./features/cli/cli-terminal-panel";
import { useWorkbenchContainerModel } from "./features/shell/use-workbench-container-model";
import { SidebarProvider } from "@/components/ui/sidebar";

export default function WorkbenchContainer() {
  const { theme, viewContext } = useWorkbenchContainerModel();
  const [cliPanelOpen, setCliPanelOpen] = useState(false);
  const [cliPanelHeight, setCliPanelHeight] = useState(260);
  const cliContext = { ...viewContext, cliPanelOpen, cliPanelHeight, setCliPanelOpen, setCliPanelHeight };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "`") return;
      event.preventDefault();
      setCliPanelOpen((current) => !current);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <WorkbenchShell theme={theme} density={viewContext.densityMode}>
      <SidebarProvider open={viewContext.sidebarOpen} onOpenChange={viewContext.setSidebarOpen}>
        <WorkbenchAppBar ctx={cliContext} />
        <WorkbenchSidebar ctx={cliContext} />
        <WorkbenchMainPanel ctx={cliContext} />
        <CliTerminalPanel
          open={cliPanelOpen}
          height={cliPanelHeight}
          shellLeft={viewContext.shellLeft}
          statusbarHeight={viewContext.designSystem.size.statusbarHeight}
          workspacePath={viewContext.workspaceFolderPath || ""}
          onClose={() => setCliPanelOpen(false)}
          onHeightChange={setCliPanelHeight}
        />
        <WorkbenchStatusBar ctx={cliContext} />
        <WorkbenchDialogs ctx={cliContext} />
      </SidebarProvider>
    </WorkbenchShell>
  );
}
