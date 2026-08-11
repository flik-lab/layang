"use client";

import { WorkbenchShell } from "./features/shell/workbench-shell";
import { WorkbenchAppBar } from "./features/shell/workbench-app-bar";
import { WorkbenchSidebar } from "./features/shell/workbench-sidebar";
import { WorkbenchMainPanel } from "./features/shell/workbench-main-panel";
import { WorkbenchDialogs } from "./features/shell/workbench-dialogs";
import { WorkbenchStatusBar } from "./features/shell/workbench-status-bar";
import { useWorkbenchContainerModel } from "./features/shell/use-workbench-container-model";
import { SidebarProvider } from "@/components/ui/sidebar";

export default function WorkbenchContainer() {
  const { theme, viewContext } = useWorkbenchContainerModel();

  return (
    <WorkbenchShell theme={theme} density={viewContext.densityMode}>
      <SidebarProvider open={viewContext.sidebarOpen} onOpenChange={viewContext.setSidebarOpen}>
        <WorkbenchAppBar ctx={viewContext} />
        <WorkbenchSidebar ctx={viewContext} />
        <WorkbenchMainPanel ctx={viewContext} />
        <WorkbenchStatusBar ctx={viewContext} />
        <WorkbenchDialogs ctx={viewContext} />
      </SidebarProvider>
    </WorkbenchShell>
  );
}
