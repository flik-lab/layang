import type { Dispatch, SetStateAction } from "react";
import type { WorkbenchViewContext } from "./use-workbench-container-model";

/** Static/control-plane model consumed by the title bar. */
export type WorkbenchAppBarModel = WorkbenchViewContext;

/** Static/control-plane model consumed by sidebar navigation and editors. */
export type WorkbenchSidebarModel = WorkbenchViewContext;

/** Control-plane model shared by the active workbench workspace. */
export type WorkbenchMainPanelModel = WorkbenchViewContext;

/** Main-panel layout state owned by the shell rather than the domain model. */
export type WorkbenchMainPanelRuntimeModel = WorkbenchMainPanelModel & {
  cliPanelOpen: boolean;
  cliPanelHeight: number;
};

/** Dialog-only control-plane model. */
export type WorkbenchDialogsModel = WorkbenchViewContext;

/** Status bar receives only slow shell state; runtime statuses are self-subscribed. */
export type WorkbenchStatusBarModel = Pick<WorkbenchViewContext, "workspaceFolderPath" | "activeRunning">;

export type WorkbenchCliPanelModel = {
  cliPanelOpen: boolean;
  setCliPanelOpen: Dispatch<SetStateAction<boolean>>;
};
