"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Paper, Stack, Typography } from "@/components/shadcn/compat";
import type { WorkbenchViewContext } from "../shell/use-workbench-container-model";
import { WorkbenchCollectionsMainPanel } from "../shell/workbench-main-panel";
import { WorkbenchStatusBar } from "../shell/workbench-status-bar";
import { ServicesWorkspace } from "../services/services-workspace";
import { MockingSidebar } from "../mock-server/sidebar/MockingSidebar";
import { WorkbenchResponsePanel } from "../response-viewer/response-workbench-panel";
import { grpcMockOverviewMethodKey } from "../../shared/workbench-constants";
import { DetachedWindowTitlebar } from "./detached-window-titlebar";
import { PerformanceStatsPanel } from "../../shared/performance/PerformanceStatsPanel";
import type { PerformanceSnapshot } from "../../shared/performance/performance-stats.store";

async function handoffDetachedWorkspace(ctx: WorkbenchViewContext) {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  const bundle = ctx.getWorkspaceExportBundle();
  if (ctx.workspaceFolderPath && window.electronWorkspace?.saveFolder) {
    const result = await window.electronWorkspace.saveFolder(bundle, ctx.workspaceFolderPath).catch(() => null);
    if (!result?.ok) return false;
  }
  await window.electronWindow?.broadcast?.("workspace:handoff", { bundle });
  return true;
}

async function closeDetachedAfterHandoff(ctx: WorkbenchViewContext, mode: "close" | "reattach") {
  if (!(await handoffDetachedWorkspace(ctx))) return;
  if (mode === "reattach") await ctx.managedWindow.reattach();
  else await window.electronWindow?.close?.();
}

export function DetachedRequestWindow({ ctx }: { ctx: WorkbenchViewContext }) {
  const resourceId = ctx.managedWindow.context.resourceId || "";
  const session = ctx.requestSessions.find((item) => item.id === resourceId) ?? null;
  const detachedCtx = useMemo(
    () => ({
      ...ctx,
      shellLeft: 0,
      sidebarOpen: false,
      requestSessions: session ? [session] : [],
      closeRequestSession: () => void window.electronWindow?.reattach?.(),
      closeAllRequestSessions: () => void window.electronWindow?.reattach?.(),
      closeOtherRequestSessions: () => undefined,
      reorderRequestSessions: () => undefined,
    }),
    [ctx, session],
  );

  const title = session?.title || ctx.managedWindow.context.title || "Request";
  return (
    <>
      <DetachedWindowTitlebar
        context={ctx.managedWindow.context}
        title={title}
        returnLabel="Back to Main"
        onReturn={() => void closeDetachedAfterHandoff(ctx, "reattach")}
        onClose={() => void closeDetachedAfterHandoff(ctx, "close")}
      />
      {session ? (
        <WorkbenchCollectionsMainPanel ctx={{ ...detachedCtx, cliPanelOpen: false, cliPanelHeight: 0 }} />
      ) : (
        <MissingDetachedResource title="Request is unavailable" body="The request may have been removed or is not loaded in this workspace." />
      )}
      <WorkbenchStatusBar ctx={ctx} cliPanelOpen={false} setCliPanelOpen={(_value) => undefined} />
    </>
  );
}

export function DetachedMockingWindow({ ctx }: { ctx: WorkbenchViewContext }) {
  const latestCtxRef = useRef(ctx);
  latestCtxRef.current = ctx;
  const {
    activeRestMockScenario,
    activeRestMockScenarios,
    activeWebSocketMockScenario,
    activeWebSocketMockScenarios,
    addRestMockScenario,
    addWebSocketMockScenario,
    mockSelectedMethodKey,
    mockServerStatus,
    selectProtoLibraryVersion,
    selectWebSocketMockScenario,
    serviceProtocol,
    setMockSelectedMethodKey,
    setRestMockScenarioId,
    setServiceProtocol,
    setServicesSection,
  } = ctx;

  return (
    <>
      <DetachedWindowTitlebar
        context={ctx.managedWindow.context}
        title="Mocking"
        returnLabel="Back to Main"
        onReturn={() => {
          if (ctx.mockScenarioEditorDirty && !ctx.saveMockScenarioEditorDraft()) return;
          window.requestAnimationFrame(() => void closeDetachedAfterHandoff(latestCtxRef.current, "reattach"));
        }}
        onClose={() => {
          if (ctx.mockScenarioEditorDirty && !ctx.saveMockScenarioEditorDraft()) return;
          window.requestAnimationFrame(() => void closeDetachedAfterHandoff(latestCtxRef.current, "close"));
        }}
      />
      <Box
        sx={{
          position: "fixed",
          top: ctx.designSystem.size.titlebarHeight,
          left: 0,
          right: 0,
          bottom: 0,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          overflow: "hidden",
          bgcolor: "background.default",
        }}
      >
        <Box
          component="aside"
          sx={{
            width: 292,
            minWidth: 220,
            maxWidth: "42vw",
            minHeight: 0,
            overflow: "hidden",
            borderRight: "1px solid var(--border-strong)",
            bgcolor: "background.paper",
            py: 0.5,
          }}
        >
          <MockingSidebar
            running={Boolean(mockServerStatus?.running)}
            selectedMethodKey={mockSelectedMethodKey}
            serviceProtocol={serviceProtocol}
            onSelectGrpcMethod={(row) => {
              selectProtoLibraryVersion(row.libraryId, row.versionId, { persistDefault: false });
              setMockSelectedMethodKey(row.methodKey);
              setServicesSection("mock-servers");
              setServiceProtocol("grpc-mock");
            }}
            onSelectProtocol={(protocol) => {
              setServicesSection("mock-servers");
              if (protocol === "grpc-mock") setMockSelectedMethodKey(grpcMockOverviewMethodKey);
              setServiceProtocol(protocol);
            }}
            onOpenGrpcHome={() => {
              setServicesSection("mock-servers");
              setMockSelectedMethodKey(grpcMockOverviewMethodKey);
              setServiceProtocol("grpc-mock");
            }}
            restScenarios={activeRestMockScenarios}
            selectedRestScenarioId={activeRestMockScenario?.id}
            onSelectRestScenario={(id) => {
              setRestMockScenarioId(id);
              setServiceProtocol("rest");
            }}
            onAddRestScenario={() => addRestMockScenario("success")}
            websocketScenarios={activeWebSocketMockScenarios}
            selectedWebSocketScenarioId={activeWebSocketMockScenario?.id}
            onSelectWebSocketScenario={(id) => {
              selectWebSocketMockScenario(id);
              setServiceProtocol("websocket");
            }}
            onAddWebSocketScenario={addWebSocketMockScenario}
          />
        </Box>
        <Box sx={{ minWidth: 0, minHeight: 0, flex: 1, overflow: "hidden" }}>
          <ServicesWorkspace ctx={ctx} />
        </Box>
      </Box>
    </>
  );
}

export function DetachedResponseWindow({ ctx }: { ctx: WorkbenchViewContext }) {
  const resourceId = ctx.managedWindow.context.resourceId || "";
  const session = ctx.requestSessions.find((item) => item.id === resourceId) ?? ctx.activeSession ?? null;
  const title = session?.title || ctx.managedWindow.context.title || "Response";
  const responseSessionId = ctx.managedWindow.context.responseSessionId || session?.responseSessionId || session?.id || "__unbound__";

  return (
    <>
      <DetachedWindowTitlebar context={ctx.managedWindow.context} title={`${title} — Response`} returnLabel="Back to Request" />
      <Box
        sx={{
          position: "fixed",
          top: ctx.designSystem.size.titlebarHeight,
          left: 0,
          right: 0,
          bottom: 0,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          overflow: "hidden",
          bgcolor: "background.default",
        }}
      >
        {session ? (
          <WorkbenchResponsePanel
            activeIsRest={session.requestKind === "rest"}
            activeIsWebSocket={session.requestKind === "websocket"}
            activeRunning={Boolean(session.running)}
            beginResponseResize={() => undefined}
            clearActiveResponse={ctx.clearActiveResponseStable}
            effectiveRequestResponseLayout="vertical"
            exportResponse={ctx.exportResponseStable}
            handleResponseTabChange={ctx.handleResponseTabChange}
            onOpenDocs={() => undefined}
            responseBodyRef={ctx.responseBodyRef}
            responseHeight={Math.max(320, ctx.responseHeight)}
            responseSessionId={responseSessionId}
            responseTab={ctx.responseTab}
            responseWidth={Math.max(420, ctx.responseWidth)}
            responseCollapsed={false}
            setResponseCollapsed={() => undefined}
            resizeResponseByKeyboard={() => undefined}
            saveCurrentResultForDocs={ctx.saveCurrentResultForDocsStable}
            selectedMethod={ctx.selectedMethod}
            detached
          />
        ) : (
          <MissingDetachedResource title="Response is unavailable" body="The request may have been removed or is not loaded in this workspace." />
        )}
      </Box>
    </>
  );
}

export function DetachedPerformanceWindow({ ctx }: { ctx: WorkbenchViewContext }) {
  const [snapshot, setSnapshot] = useState<PerformanceSnapshot | null>(null);
  const [history, setHistory] = useState<PerformanceSnapshot[]>([]);
  const titlebarContext = useMemo(
    () => (ctx.managedWindow.context.kind === "performance" ? ctx.managedWindow.context : { ...ctx.managedWindow.context, kind: "performance" as const }),
    [ctx.managedWindow.context],
  );

  useEffect(() => {
    const unsubscribe = window.electronWindow?.onEvent?.((event) => {
      if (event?.topic !== "performance:snapshot") return;
      const next = (event.payload as { snapshot?: PerformanceSnapshot } | undefined)?.snapshot;
      if (!next) return;
      setSnapshot(next);
      setHistory((current) => {
        const updated = [...current, next];
        return updated.length > 120 ? updated.slice(updated.length - 120) : updated;
      });
    });
    return () => unsubscribe?.();
  }, []);

  return (
    <>
      <DetachedWindowTitlebar context={titlebarContext} title="Performance" />
      <Box
        sx={{
          position: "fixed",
          top: ctx.designSystem.size.titlebarHeight,
          left: 0,
          right: 0,
          bottom: 0,
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
          bgcolor: "background.default",
        }}
      >
        {snapshot ? (
          <PerformanceStatsPanel
            open
            standalone
            snapshotOverride={snapshot}
            historyOverride={history}
            streamActive={Boolean(snapshot.runtime.streamActive)}
            mockActive={Boolean(snapshot.runtime.mockActive)}
            onClose={() => void window.electronWindow?.close?.()}
          />
        ) : (
          <Paper
            elevation={0}
            sx={{ height: "100%", display: "grid", placeItems: "center", borderRadius: 0, bgcolor: "background.default" }}
          >
            <Stack spacing={0.5} alignItems="center">
              <Typography variant="body2" fontWeight={600}>Waiting for performance samples…</Typography>
              <Typography variant="caption" color="text.secondary">Keep the main Layang window open.</Typography>
            </Stack>
          </Paper>
        )}
      </Box>
    </>
  );
}

function MissingDetachedResource({ title, body }: { title: string; body: string }) {
  return (
    <Paper
      elevation={0}
      sx={{ position: "fixed", inset: "36px 0 0", display: "grid", placeItems: "center", borderRadius: 0 }}
    >
      <Stack spacing={0.75} alignItems="center" textAlign="center" sx={{ maxWidth: 520, p: 3 }}>
        <Typography variant="h6">{title}</Typography>
        <Typography variant="body2" color="text.secondary">{body}</Typography>
      </Stack>
    </Paper>
  );
}
