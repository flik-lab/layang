"use client";

import { useEffect, useState, useSyncExternalStore, type ChangeEvent, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Alert, Box, Paper, Stack, Typography } from "@/components/shadcn/compat";
import { designSystem } from "@/lib/design-system";
import type { RpcMethodInfo } from "@/lib/types";
import type { ResponseTab, UiEvent } from "../../shared/workbench-types";
import { minResponseHeight, minResponseWidth, panelSx } from "../../shared/workbench-constants";
import { JsonBlock } from "./response-viewer";
import { ResponseToolbar, ResponseWorkbenchTabs } from "./response-toolbar";
import { useResponseSelector } from "./model/useResponseSelector";
import { responseSessionRegistry } from "./model/responseSessionRegistry";
import { MessageReadingWorkspace } from "./message-list/MessageReadingWorkspace";
import { LatestResponseViewer } from "./latest/LatestResponseViewer";
import { useWorkbenchSideSection } from "../shell/workbench-navigation-store";
import { performanceStats } from "../../shared/performance/performance-stats.store";

type WorkbenchResponsePanelProps = {
  activeIsRest: boolean;
  activeIsWebSocket: boolean;
  activeRunning: boolean;
  beginResponseResize: (event: ReactMouseEvent<HTMLDivElement>) => void;
  clearActiveResponse: () => unknown;
  effectiveRequestResponseLayout: "vertical" | "horizontal";
  exportResponse: () => unknown;
  handleResponseTabChange: (value: ResponseTab) => void;
  onOpenDocs: () => void;
  responseBodyRef: RefObject<HTMLDivElement | null>;
  responseHeight: number;
  responseSessionId: string;
  responseTab: ResponseTab;
  responseWidth: number;
  resizeResponseByKeyboard: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  saveCurrentResultForDocs: () => unknown;
  selectedMethod: RpcMethodInfo | null;
};

export function WorkbenchResponsePanel(props: WorkbenchResponsePanelProps) {
  const sideSection = useWorkbenchSideSection();
  if (sideSection !== "collections") return null;
  return <ActiveWorkbenchResponsePanel {...props} />;
}

function ActiveWorkbenchResponsePanel(props: WorkbenchResponsePanelProps) {
  performanceStats.recordRenderInvocation("responsePanel");
  const {
    activeIsRest, activeIsWebSocket, activeRunning, beginResponseResize, clearActiveResponse,
    effectiveRequestResponseLayout, exportResponse, handleResponseTabChange, onOpenDocs, responseBodyRef,
    responseHeight, responseSessionId, responseTab, responseWidth, resizeResponseByKeyboard, saveCurrentResultForDocs,
    selectedMethod,
  } = props;
  const responseRuntime = responseSessionRegistry.getOrCreate(responseSessionId);
  const responseStreamStore = responseRuntime.store;
  const runtimeSnapshot = useSyncExternalStore(responseRuntime.subscribe, responseRuntime.getSnapshot, responseRuntime.getSnapshot);
  const resultSummary = runtimeSnapshot.resultSummary;
  const assertionResults = runtimeSnapshot.assertionResults;
  const messageCount = useResponseSelector(responseStreamStore, (snapshot) => snapshot.orderedMessageIds.length);
  const responseFilter = useResponseSelector(responseStreamStore, (snapshot) => snapshot.responseFilter);
  const controlEvents = useResponseSelector(responseStreamStore, (snapshot) => snapshot.controlEvents);
  const [responseFullscreen, setResponseFullscreen] = useState(false);
  const [responseCollapsed, setResponseCollapsed] = useState(false);
  useEffect(() => {
    if (!responseFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setResponseFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [responseFullscreen]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "j") return;
      event.preventDefault();
      setResponseCollapsed((current: boolean) => !current);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  const allEvents: UiEvent[] = responseStreamStore.getEvents();
  const responseSummary = activeRunning
    ? activeIsWebSocket
      ? `Connected · ${messageCount} message${messageCount === 1 ? "" : "s"}`
      : `Active · ${messageCount} message${messageCount === 1 ? "" : "s"}`
    : resultSummary
      ? `${resultSummary.httpStatus ? `HTTP ${resultSummary.httpStatus}` : "Complete"} · ${Math.round(resultSummary.durationMs ?? 0)} ms`
      : "";
  const safeAssertionResults = Array.isArray(assertionResults) ? assertionResults : [];

  function handleResponseFilterChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    responseStreamStore.setResponseFilter(event.target.value);
  }

  const renderResponseLayer = (children: ReactNode) =>
    responseFullscreen && typeof document !== "undefined"
      ? createPortal(<div style={{ position: "fixed", inset: 0, zIndex: 2147483100, WebkitAppRegion: "no-drag" } as CSSProperties}>{children}</div>, document.body)
      : children;

  return (
    <>
      <Box
        role="separator"
        tabIndex={0}
        aria-orientation={effectiveRequestResponseLayout === "horizontal" ? "vertical" : "horizontal"}
        aria-label="Resize request and response panels"
        aria-valuenow={effectiveRequestResponseLayout === "horizontal" ? responseWidth : responseHeight}
        onMouseDown={beginResponseResize}
        onKeyDown={resizeResponseByKeyboard}
        sx={{
          width: effectiveRequestResponseLayout === "horizontal" ? 8 : "100%",
          height: effectiveRequestResponseLayout === "horizontal" ? "100%" : 8,
          flexShrink: 0,
          cursor: effectiveRequestResponseLayout === "horizontal" ? "col-resize" : "row-resize",
          display: responseFullscreen || responseCollapsed ? "none" : "flex",
          alignItems: "center", justifyContent: "center", outline: "none",
          "&::after": { content: '""', width: effectiveRequestResponseLayout === "horizontal" ? 1 : "100%", height: effectiveRequestResponseLayout === "horizontal" ? "100%" : 1, bgcolor: "transparent" },
          "&:hover::after, &:focus-visible::after": { bgcolor: "var(--border-strong)" },
        }}
      />
      {renderResponseLayer(
        <>
          {responseFullscreen ? <Box aria-hidden="true" onClick={() => setResponseFullscreen(false)} sx={{ position: "absolute", inset: 0, zIndex: 0, bgcolor: "rgba(2,6,23,0.72)", backdropFilter: "blur(3px)" }} /> : null}
          <Paper
            elevation={0}
            role={responseFullscreen ? "dialog" : undefined}
            aria-modal={responseFullscreen ? true : undefined}
            sx={{
              ...panelSx,
              flex: effectiveRequestResponseLayout === "horizontal" ? responseCollapsed ? "0 0 30px" : `0 0 ${responseWidth}px` : responseCollapsed ? "0 0 30px" : `0 0 ${responseHeight}px`,
              minHeight: effectiveRequestResponseLayout === "horizontal" ? 0 : responseCollapsed ? 30 : minResponseHeight,
              minWidth: effectiveRequestResponseLayout === "horizontal" ? responseCollapsed ? 30 : minResponseWidth : 0,
              maxWidth: effectiveRequestResponseLayout === "horizontal" && !responseFullscreen ? "calc(100% - 360px)" : undefined,
              display: "flex", flexDirection: "column", borderRadius: 0, border: 0, boxShadow: "none", bgcolor: "background.paper",
              ...(responseFullscreen ? { position: "absolute", top: 24, right: 24, bottom: 24, left: 24, zIndex: 1, width: "auto", height: "auto", minWidth: 0, minHeight: 0, flex: "none", border: "1px solid", borderRadius: 1, borderColor: "primary.main", boxShadow: "0 28px 90px rgba(0,0,0,0.5)" } : {}),
            }}
          >
            <ResponseToolbar
              filter={responseFilter}
              highlightQuery={responseFilter}
              searchScopeKey={responseTab}
              searchRootId={`response-viewer-panel-${responseTab}`}
              summary={responseSummary}
              hasEvents={messageCount > 0 || controlEvents.length > 0}
              hasLastResult={Boolean(resultSummary)}
              canSaveDocs={Boolean(resultSummary && selectedMethod)}
              onFilterChange={handleResponseFilterChange}
              onClearFilter={() => responseStreamStore.setResponseFilter("")}
              onExport={() => void exportResponse()}
              onSaveDocs={() => { void saveCurrentResultForDocs(); onOpenDocs(); }}
              onClearResponse={() => void clearActiveResponse()}
              fullscreen={responseFullscreen}
              onToggleFullscreen={() => setResponseFullscreen((current: boolean) => !current)}
              collapsed={responseCollapsed}
              onToggleCollapsed={() => setResponseCollapsed((current: boolean) => !current)}
              layout={effectiveRequestResponseLayout}
            />
            {!responseCollapsed ? <ResponseWorkbenchTabs value={responseTab} onChange={handleResponseTabChange} kind={activeIsRest ? "rest" : activeIsWebSocket ? "websocket" : "grpc"} streaming={Boolean(selectedMethod?.responseStream || activeIsWebSocket)} /> : null}
            {!responseCollapsed ? (
              <Box ref={responseBodyRef} role="tabpanel" id={`response-viewer-panel-${responseTab}`} tabIndex={0} className="response-selectable" sx={{ p: designSystem.space.panelPadding, flex: 1, minHeight: 0, minWidth: 0, overflow: responseTab === "messages" || responseTab === "latest" ? "hidden" : "auto", position: "relative" }}>
                {responseTab === "messages" ? (
                  <MessageReadingWorkspace store={responseStreamStore} query={responseFilter} />
                ) : null}
                {responseTab === "latest" ? <LatestResponseViewer store={responseStreamStore} query={responseFilter} /> : null}
                {responseTab === "headers" ? <JsonBlock value={allEvents.filter((event) => event.kind === "headers").map((event) => event.payload)} highlightQuery={responseFilter} fullHeight={responseFullscreen} /> : null}
                {responseTab === "trailers" ? <JsonBlock value={allEvents.filter((event) => event.kind === "trailers").map((event) => event.payload)} highlightQuery={responseFilter} fullHeight={responseFullscreen} /> : null}
                {responseTab === "timeline" ? <Stack spacing={0}>{allEvents.map((event) => <Stack key={event.id} direction="row" spacing={1} sx={{ py: 0.35, borderBottom: "1px solid", borderColor: "divider" }}><Typography variant="caption" color="text.secondary" sx={{ width: 92 }}>{event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : ""}</Typography><Typography variant="caption" color="text.secondary" sx={{ width: 62 }}>{event.kind}</Typography><Typography variant="body2">{event.title}</Typography></Stack>)}</Stack> : null}
                {responseTab === "tests" ? safeAssertionResults.length ? <JsonBlock value={safeAssertionResults} highlightQuery={responseFilter} fullHeight={responseFullscreen} /> : <Alert severity="info" variant="outlined">No test assertions have been evaluated for this response.</Alert> : null}
              </Box>
            ) : null}
          </Paper>
        </>,
      )}
    </>
  );
}

