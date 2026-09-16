"use client";

import { useEffect, type ReactNode } from "react";
import { Box, Button, Paper, Stack, Typography } from "@/components/shadcn/compat";
import { mockRuntimeStore } from "../../features/mock-server/runtime/mockRuntime.store";
import { responseSessionRegistry } from "../../features/response-viewer/model/responseSessionRegistry";
import { transportLifecycleStore } from "../../features/response-viewer/model/transportLifecycle.store";
import { useWorkbenchSideSection } from "../../features/shell/workbench-navigation-store";
import { performanceStats, usePerformanceStatsSnapshot, type PerformanceRecommendation } from "./performance-stats.store";

type PerformanceStatsPanelProps = {
  open: boolean;
  onClose: () => void;
  streamActive: boolean;
  mockActive: boolean;
};

function formatRate(value: number, suffix = "/s"): string {
  return `${value.toFixed(value >= 100 ? 0 : 1)}${suffix}`;
}

function formatChars(value: number): string {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB/s`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB/s`;
  return `${Math.round(value)} B/s`;
}

function StatRow({ label, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 1, py: 0.2 }}>
      <Typography variant="caption" sx={{ color: "text.secondary" }} noWrap>{label}</Typography>
      <Typography variant="caption" sx={{ color: warn ? "warning.main" : "text.primary", fontFamily: "monospace" }} noWrap>{value}</Typography>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" sx={{ display: "block", mb: 0.4, color: "text.primary", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>{title}</Typography>
      {children}
    </Box>
  );
}

function Recommendation({ item }: { item: PerformanceRecommendation; key?: string }) {
  const marker = item.severity === "bad" ? "!!" : item.severity === "warn" ? "!" : "OK";
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "32px 92px minmax(0, 1fr)", gap: 0.6, py: 0.25 }}>
      <Typography variant="caption" sx={{ fontFamily: "monospace", color: item.severity === "bad" ? "error.main" : item.severity === "warn" ? "warning.main" : "success.main" }}>{marker}</Typography>
      <Typography variant="caption" sx={{ fontWeight: 700 }}>{item.area}</Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>{item.message}</Typography>
    </Box>
  );
}


async function syncRuntimeDiagnostics(): Promise<void> {
  const response = responseSessionRegistry.getDebugStats();
  const mock = mockRuntimeStore.getDebugStats();
  const bridge = typeof window !== "undefined" ? window.electronGrpcWebTransport : undefined;
  if (bridge?.isAvailable) {
    const status = await bridge.status().catch(() => ({ runCount: 0, documentCount: 0, runs: [] }));
    transportLifecycleStore.setActiveTransportProcesses(status.runCount);
  } else {
    transportLifecycleStore.setActiveTransportProcesses(0);
  }
  performanceStats.setRuntimeDiagnostics({
    responseRuntime: {
      responseSessionCount: response.sessionCount,
      responseRegistryRecords: response.totalRetainedResponseRecords,
      responseRegistryDocumentRefs: response.totalReferencedDocumentIds,
    },
    mockRuntime: mock,
    transportLifecycle: transportLifecycleStore.getSnapshot(),
  });
}

export function PerformanceStatsPanel({ open, onClose, streamActive, mockActive }: PerformanceStatsPanelProps) {
  const sideSection = useWorkbenchSideSection();
  const snapshot = usePerformanceStatsSnapshot();

  useEffect(() => {
    if (!open) return;
    void syncRuntimeDiagnostics();
    performanceStats.setEnabled(true);
    performanceStats.setRuntime({ section: sideSection, streamActive, mockActive });
    performanceStats.sample();
    const timer = window.setInterval(() => {
      void syncRuntimeDiagnostics();
      performanceStats.setRuntime({ section: sideSection, streamActive, mockActive });
      performanceStats.sample();
    }, 500);
    return () => {
      window.clearInterval(timer);
      performanceStats.setEnabled(false);
    };
  }, [mockActive, open, sideSection, streamActive]);

  if (!open) return null;

  const copySnapshot = async () => {
    await syncRuntimeDiagnostics();
    const exportValue = {
      copiedAt: new Date().toISOString(),
      snapshot: performanceStats.sample(),
      history: performanceStats.getHistory(),
    };
    await navigator.clipboard.writeText(JSON.stringify(exportValue, null, 2));
  };

  return (
    <Paper
      elevation={8}
      role="dialog"
      aria-label="Performance stats"
      sx={{
        position: "fixed",
        right: 8,
        bottom: 28,
        zIndex: 2200,
        width: "min(760px, calc(100vw - 24px))",
        maxHeight: "min(720px, calc(100vh - 48px))",
        overflow: "auto",
        border: "1px solid",
        borderColor: "var(--border-strong)",
        borderRadius: 1,
        bgcolor: "background.paper",
        p: 1.2,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>Performance Stats</Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {snapshot.runtime.section} · 500 ms sampling
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="text" onClick={() => performanceStats.reset()}>Reset</Button>
        <Button size="small" variant="outlined" onClick={() => void copySnapshot()}>Copy Snapshot JSON</Button>
        <Button size="small" variant="text" onClick={onClose}>Close</Button>
      </Stack>

      <Box sx={{ mb: 1, p: 0.8, border: "1px solid", borderColor: "divider", bgcolor: "action.hover" }}>
        {snapshot.recommendations.map((item) => <Recommendation key={item.area} item={item} />)}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 1.4 }}>
        <Section title="Main thread">
          <StatRow label="FPS" value={snapshot.mainThread.fps.toFixed(1)} warn={snapshot.mainThread.fps > 0 && snapshot.mainThread.fps < 45} />
          <StatRow label="Frame p50" value={`${snapshot.mainThread.frameP50Ms} ms`} />
          <StatRow label="Frame p95" value={`${snapshot.mainThread.frameP95Ms} ms`} warn={snapshot.mainThread.frameP95Ms >= 24} />
          <StatRow label="Frame max" value={`${snapshot.mainThread.frameMaxMs} ms`} warn={snapshot.mainThread.frameMaxMs >= 50} />
          <StatRow label="Long tasks / 10s" value={snapshot.mainThread.longTasks10s} warn={snapshot.mainThread.longTasks10s > 0} />
          <StatRow label="Sidebar last / p95 10s" value={`${snapshot.mainThread.sidebarLastMs} / ${snapshot.mainThread.sidebarP95Ms} ms`} warn={snapshot.mainThread.sidebarP95Ms >= 50} />
          <StatRow label="JS heap used" value={snapshot.runtime.usedHeapMb === undefined ? "n/a" : `${snapshot.runtime.usedHeapMb} MB`} />
          <StatRow label="JS heap total" value={snapshot.runtime.totalHeapMb === undefined ? "n/a" : `${snapshot.runtime.totalHeapMb} MB`} />
          <StatRow label="JS heap limit" value={snapshot.runtime.heapLimitMb === undefined ? "n/a" : `${snapshot.runtime.heapLimitMb} MB`} />
        </Section>

        <Section title="Stream">
          <StatRow label="Incoming" value={formatRate(snapshot.stream.incomingPerSec)} />
          <StatRow label="Processed" value={formatRate(snapshot.stream.processedPerSec)} />
          <StatRow label="UI committed" value={formatRate(snapshot.stream.uiCommittedPerSec)} />
          <StatRow label="Payload" value={formatChars(snapshot.stream.payloadCharsPerSec)} />
          <StatRow label="Deferred backlog" value={snapshot.stream.deferredBacklog} warn={snapshot.stream.deferredBacklog > 0} />
          <StatRow label="Ingestion queue" value={snapshot.stream.ingestionQueue} warn={snapshot.stream.ingestionQueue >= 8} />
          <StatRow label="Coalesced" value={formatRate(snapshot.stream.coalescedPerSec)} warn={snapshot.stream.coalescedPerSec > 0} />
          <StatRow label="Retained messages" value={snapshot.stream.retainedMessages} />
        </Section>

        <Section title="Payload worker">
          <StatRow label="In flight" value={snapshot.payloadWorker.inFlight} warn={snapshot.payloadWorker.inFlight >= 8} />
          <StatRow label="Retained documents" value={snapshot.payloadWorker.retainedDocuments} />
          <StatRow label="Stored documents" value={snapshot.payloadWorker.actualDocumentCount} />
          <StatRow label="Decoded / indexed / pinned" value={`${snapshot.payloadWorker.decodedDocuments} / ${snapshot.payloadWorker.indexedDocuments} / ${snapshot.payloadWorker.pinnedDocuments}`} />
          <StatRow label="Resident memory" value={`${snapshot.payloadWorker.residentMb} MB`} warn={snapshot.payloadWorker.residentMb >= 64} />
          <StatRow label="Raw / index memory" value={`${snapshot.payloadWorker.rawMb} / ${snapshot.payloadWorker.indexMb} MB`} />
          <StatRow label="Register p95 10s" value={`${snapshot.payloadWorker.registerP95Ms} ms`} warn={snapshot.payloadWorker.registerP95Ms >= 20} />
          <StatRow label="getMeta/prepare p95 10s" value={`${snapshot.payloadWorker.getMetaP95Ms} ms`} warn={snapshot.payloadWorker.getMetaP95Ms >= 40} />
          <StatRow label="getLines p95 10s" value={`${snapshot.payloadWorker.getLinesP95Ms} ms`} warn={snapshot.payloadWorker.getLinesP95Ms >= 20} />
          <StatRow label="Search p95 10s" value={`${snapshot.payloadWorker.searchP95Ms} ms`} warn={snapshot.payloadWorker.searchP95Ms >= 50} />
          <StatRow label="getText p95 10s" value={`${snapshot.payloadWorker.getTextP95Ms} ms`} warn={snapshot.payloadWorker.getTextP95Ms >= 50} />
        </Section>

        <Section title="Mock catalog">
          <StatRow label="Methods" value={snapshot.mockCatalog.methods} />
          <StatRow label="Scenarios" value={snapshot.mockCatalog.scenarios} />
          <StatRow label="Visible rows" value={snapshot.mockCatalog.visibleRows} />
          <StatRow label="Worker in flight" value={snapshot.mockCatalog.inFlight} warn={snapshot.mockCatalog.inFlight >= 4} />
          <StatRow label="Source sync p95 10s" value={`${snapshot.mockCatalog.sourceSyncP95Ms} ms`} warn={snapshot.mockCatalog.sourceSyncP95Ms >= 100} />
          <StatRow label="Query p95 10s" value={`${snapshot.mockCatalog.queryP95Ms} ms`} warn={snapshot.mockCatalog.queryP95Ms >= 50} />
          <StatRow label="Catalog runtime p95 10s" value={`${snapshot.mockCatalog.runtimeUpdateP95Ms} ms`} warn={snapshot.mockCatalog.runtimeUpdateP95Ms >= 50} />
          <StatRow label="Server start p95 10s" value={`${snapshot.mockCatalog.serverStartP95Ms} ms`} warn={snapshot.mockCatalog.serverStartP95Ms >= 250} />
          <StatRow label="Server update p95 10s" value={`${snapshot.mockCatalog.serverUpdateP95Ms} ms`} warn={snapshot.mockCatalog.serverUpdateP95Ms >= 250} />
        </Section>

        <Section title="Response runtime">
          <StatRow label="Sessions" value={snapshot.responseRuntime.responseSessionCount} />
          <StatRow label="Retained records" value={snapshot.responseRuntime.responseRegistryRecords} />
          <StatRow label="Document refs" value={snapshot.responseRuntime.responseRegistryDocumentRefs} />
        </Section>

        <Section title="Mock runtime">
          <StatRow label="Polls" value={formatRate(snapshot.mockRuntime.mockPollsPerSec)} />
          <StatRow label="Runtime status polls" value={formatRate(snapshot.mockRuntime.runtimeStatusPollsPerSec)} warn={snapshot.mockRuntime.runtimeStatusPollsPerSec > 0 && typeof window !== "undefined" && window.electronRuntime?.mode === "utility"} />
          <StatRow label="Published changes" value={formatRate(snapshot.mockRuntime.mockPublishedChangesPerSec)} />
        </Section>

        <Section title="Transport lifecycle">
          <StatRow label="Decode workers" value={snapshot.transportLifecycle.activeDecodeWorkers} warn={snapshot.transportLifecycle.activeDecodeWorkers > 1} />
          <StatRow label="Pending decode ACKs" value={snapshot.transportLifecycle.pendingDecodeAcks} warn={snapshot.transportLifecycle.pendingDecodeAcks > 2} />
          <StatRow label="Producer channels" value={snapshot.transportLifecycle.payloadProducerChannels} warn={snapshot.transportLifecycle.payloadProducerChannels > 1} />
          <StatRow label="Active subscriptions" value={snapshot.transportLifecycle.activeStreamSubscriptions} />
          <StatRow label="Transport processes" value={snapshot.transportLifecycle.activeTransportProcesses} warn={snapshot.transportLifecycle.activeTransportProcesses > 2} />
          <StatRow label="Deferred events" value={snapshot.transportLifecycle.deferredEventCount} warn={snapshot.transportLifecycle.deferredEventCount > 0} />
          <StatRow label="Ingestion queue" value={snapshot.transportLifecycle.ingestionQueueDepth} warn={snapshot.transportLifecycle.ingestionQueueDepth >= 8} />
        </Section>

        <Section title="React">
          <StatRow label="Container renders" value={formatRate(snapshot.react.containerRendersPerSec)} />
          <StatRow label="Collections renders" value={formatRate(snapshot.react.collectionsRendersPerSec)} />
          <StatRow label="Workbench commits" value={formatRate(snapshot.react.workbenchCommitsPerSec)} />
          <StatRow label="Workbench commit p95 10s" value={`${snapshot.react.workbenchP95Ms} ms`} warn={snapshot.react.workbenchP95Ms >= 16} />
          <StatRow label="Mocking commits" value={formatRate(snapshot.react.mockingCommitsPerSec)} />
          <StatRow label="Mocking commit p95 10s" value={`${snapshot.react.mockingP95Ms} ms`} warn={snapshot.react.mockingP95Ms >= 16} />
          <StatRow label="Response commits" value={formatRate(snapshot.react.responseCommitsPerSec)} />
          <StatRow label="Response commit p95 10s" value={`${snapshot.react.responseP95Ms} ms`} warn={snapshot.react.responseP95Ms >= 16} />
          <StatRow label="Response panel renders" value={formatRate(snapshot.react.responsePanelRendersPerSec)} />
          <StatRow label="Latest viewer renders" value={formatRate(snapshot.react.latestViewerRendersPerSec)} />
          <StatRow label="Message workspace renders" value={formatRate(snapshot.react.messageWorkspaceRendersPerSec)} />
          <StatRow label="Status bar renders" value={formatRate(snapshot.react.statusBarRendersPerSec)} />
        </Section>

        <Section title="Session peaks">
          <StatRow label="Sidebar" value={`${snapshot.sessionMax.sidebarMs} ms`} />
          <StatRow label="Payload getLines" value={`${snapshot.sessionMax.payloadGetLinesMs} ms`} />
          <StatRow label="Mock runtime update" value={`${snapshot.sessionMax.mockRuntimeUpdateMs} ms`} />
          <StatRow label="Workbench commit" value={`${snapshot.sessionMax.workbenchCommitMs} ms`} />
          <StatRow label="Mocking commit" value={`${snapshot.sessionMax.mockingCommitMs} ms`} />
          <StatRow label="Response commit" value={`${snapshot.sessionMax.responseCommitMs} ms`} />
        </Section>

        <Section title="Runtime">
          <StatRow label="Section" value={snapshot.runtime.section} />
          <StatRow label="Stream active" value={snapshot.runtime.streamActive ? "yes" : "no"} />
          <StatRow label="Mock active" value={snapshot.runtime.mockActive ? "yes" : "no"} />
          <StatRow label="Sampling" value={snapshot.enabled ? "enabled" : "disabled"} />
        </Section>
      </Box>
    </Paper>
  );
}
