"use client";

import { WorkbenchShell } from "./features/shell/workbench-shell";
import { WorkbenchAppBar } from "./features/shell/workbench-app-bar";
import { WorkbenchSidebar } from "./features/shell/workbench-sidebar";
import { WorkbenchMainPanel } from "./features/shell/workbench-main-panel";
import { WorkbenchDialogs } from "./features/shell/workbench-dialogs";
import { useWorkbenchContainerModel } from "./features/shell/use-workbench-container-model";

export default function WorkbenchContainer() {
  const { theme, viewContext } = useWorkbenchContainerModel();

  return (
    <WorkbenchShell theme={theme}>
      <WorkbenchAppBar ctx={viewContext} />
      <WorkbenchSidebar ctx={viewContext} />
      <WorkbenchMainPanel ctx={viewContext} />
      <WorkbenchDialogs ctx={viewContext} />
    </WorkbenchShell>
  );
}
